package com.duvdivan.duvyagistudio

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import kotlin.concurrent.thread

private const val ACTION_PERMISSION = "com.duvdivan.duvyagistudio.USB_PERMISSION"
private const val NANOVNA_VENDOR = 0x0483     // STMicroelectronics, whose USB stack the NanoVNA uses
private const val NANOVNA_PRODUCT = 0x5740    // its virtual COM port
private const val SET_LINE_CODING = 0x20      // CDC-ACM requests, from the USB class spec
private const val SET_CONTROL_LINE_STATE = 0x22
private const val TO_INTERFACE = 0x21         // class request, host to interface
private const val DTR_AND_RTS = 0x03
private const val READ_WAIT_MS = 200          // a read gives up after this, to check whether the link has closed
private const val WRITE_WAIT_MS = 2000

/**
 * The NanoVNA over USB, for phones: a WebView has no Web Serial, so the page's serial port is this.
 * A NanoVNA is a plain CDC-ACM serial device, so no driver or library is needed, only Android's USB host API.
 * Any CDC-ACM device will do if no NanoVNA is plugged in, which covers its clones.
 */
class UsbSerial(
    private val context: Context,
    private val onData: (ByteArray, Int) -> Unit,
    private val onClosed: (String) -> Unit,
) {
    private val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var device: UsbDevice? = null
    private var connection: UsbDeviceConnection? = null
    private var data: UsbInterface? = null
    private var control: UsbInterface? = null
    private var output: UsbEndpoint? = null
    @Volatile private var running = false

    private val unplugged = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            if (intentDevice(intent)?.deviceId == device?.deviceId) close("The NanoVNA was unplugged.")
        }
    }

    /** Asks for permission if needed, opens the link, and calls done with null or what went wrong. */
    fun open(done: (String?) -> Unit) {
        close("reopened")
        val found = manager.deviceList.values.firstOrNull { it.vendorId == NANOVNA_VENDOR && it.productId == NANOVNA_PRODUCT }
            ?: manager.deviceList.values.firstOrNull { dataInterface(it) != null }
        if (found == null) {
            done("No NanoVNA found. Plug it in through a USB OTG adapter, switch it on and try again.")
            return
        }
        if (manager.hasPermission(found)) {
            done(start(found))
            return
        }
        val asked = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                context.unregisterReceiver(this)
                val yes = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                done(if (yes) start(found) else "Permission to use the NanoVNA wasn't given.")
            }
        }
        register(asked, ACTION_PERMISSION)
        val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val request = PendingIntent.getBroadcast(context, 0, Intent(ACTION_PERMISSION).setPackage(context.packageName), PendingIntent.FLAG_UPDATE_CURRENT or mutable)
        manager.requestPermission(found, request)
    }

    private fun register(receiver: BroadcastReceiver, action: String) {
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") context.registerReceiver(receiver, filter)
    }

    private fun intentDevice(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)

    /** The interface with a bulk endpoint each way, which carries the serial bytes. */
    private fun dataInterface(d: UsbDevice): UsbInterface? = (0 until d.interfaceCount).map { d.getInterface(it) }.firstOrNull { i ->
        i.interfaceClass == UsbConstants.USB_CLASS_CDC_DATA && endpoint(i, UsbConstants.USB_DIR_IN) != null && endpoint(i, UsbConstants.USB_DIR_OUT) != null
    }

    private fun endpoint(i: UsbInterface, direction: Int): UsbEndpoint? = (0 until i.endpointCount).map { i.getEndpoint(it) }
        .firstOrNull { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == direction }

    private fun start(d: UsbDevice): String? {
        val di = dataInterface(d) ?: return "That USB device isn't a serial port."
        val ci = (0 until d.interfaceCount).map { d.getInterface(it) }.firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_COMM }
        val c = manager.openDevice(d) ?: return "Android wouldn't open the USB device."
        if (!c.claimInterface(di, true) || (ci != null && !c.claimInterface(ci, true))) {
            c.close()
            return "Another app is using the USB device."
        }
        // 115200 baud, 1 stop bit, no parity, 8 data bits. The NanoVNA ignores the rate, but its firmware
        // only answers once the host has raised DTR, as a PC's serial port does.
        val index = ci?.id ?: 0
        val coding = byteArrayOf(0x00, 0xC2.toByte(), 0x01, 0x00, 0, 0, 8)
        c.controlTransfer(TO_INTERFACE, SET_LINE_CODING, 0, index, coding, coding.size, WRITE_WAIT_MS)
        c.controlTransfer(TO_INTERFACE, SET_CONTROL_LINE_STATE, DTR_AND_RTS, index, null, 0, WRITE_WAIT_MS)
        device = d; connection = c; data = di; control = ci; output = endpoint(di, UsbConstants.USB_DIR_OUT)
        register(unplugged, UsbManager.ACTION_USB_DEVICE_DETACHED)
        running = true
        val input = endpoint(di, UsbConstants.USB_DIR_IN)!!
        thread(name = "usb-read") {
            val buffer = ByteArray(16384)
            while (running) {
                val n = c.bulkTransfer(input, buffer, buffer.size, READ_WAIT_MS)
                if (n > 0) onData(buffer, n)
            }
        }
        return null
    }

    fun write(bytes: ByteArray): Boolean {
        val c = connection ?: return false
        val out = output ?: return false
        var at = 0
        while (at < bytes.size) {
            val n = c.bulkTransfer(out, bytes, at, bytes.size - at, WRITE_WAIT_MS)
            if (n <= 0) return false
            at += n
        }
        return true
    }

    fun close(why: String) {
        if (!running) return
        running = false
        runCatching { context.unregisterReceiver(unplugged) }
        val c = connection
        connection = null
        output = null
        // the read thread may still be inside a transfer: give it time to leave before the connection goes
        thread(name = "usb-close") {
            Thread.sleep(READ_WAIT_MS + 50L)
            data?.let { c?.releaseInterface(it) }
            control?.let { c?.releaseInterface(it) }
            c?.close()
        }
        onClosed(why)
    }
}
