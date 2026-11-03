package com.duvdivan.duvyagistudio

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import kotlin.concurrent.thread

private const val HOST = "appassets.androidplatform.net"
private const val PAGE = "https://$HOST/assets/index.html"
private const val PICK_FILE = 1      // onActivityResult: a file chosen for the page to read
private const val SAVE_FILE = 2      // onActivityResult: a place chosen to save a file

/**
 * The whole app: one WebView showing the studio's page from inside the APK, and what that page can't do
 * alone. The solver and the interface are the same code as the web version, in src/. They run on the
 * phone, in the WebView and its workers, so nothing here needs a server or even a network.
 *
 * The page is served from https://appassets... rather than file://, because workers, storage and
 * clipboard all need a secure origin. Nothing leaves the phone: that name never reaches the network.
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var usb: UsbSerial
    private var picking: ValueCallback<Array<Uri>>? = null
    private var saving: Saving? = null

    private class Saving(val id: Int, val text: String)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true           // designs are kept in localStorage
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = true
            setSupportZoom(false)              // pinching belongs to the 3D view, not the page
            builtInZoomControls = false
        }
        val assets = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            /** The page's own links stay here; links to the web go to the phone's browser. */
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            /** The page's file inputs: any type, because phones don't know .s1p or .nec. */
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                picking?.onReceiveValue(null)
                picking = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                return runCatching { startActivityForResult(intent, PICK_FILE) }
                    .onFailure { picking = null }
                    .isSuccess
            }
        }

        usb = UsbSerial(
            this,
            onData = { bytes, n -> post("DuvBridge.usbData('${Base64.encodeToString(bytes, 0, n, Base64.NO_WRAP)}')") },
            onClosed = { why -> post("DuvBridge.usbClosed(${JSONObject.quote(why)})") },
        )
        web.addJavascriptInterface(Bridge(), "DuvAndroid")

        root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        keepClearOfBars()
        setContentView(root)
        web.loadUrl(PAGE)
    }

    /** Android 15 draws every app under the status and navigation bars, so the page is inset by hand. */
    private fun keepClearOfBars() {
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
    }

    /** What the page asks of Android. These run on a background thread that the WebView owns. */
    inner class Bridge {
        @JavascriptInterface
        fun saveFile(id: Int, name: String, text: String) = runOnUiThread {
            saving = Saving(id, text)
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(typeToSave(name))
                .putExtra(Intent.EXTRA_TITLE, name)
            runCatching { startActivityForResult(intent, SAVE_FILE) }.onFailure {
                saving = null
                answer(id, false, "This phone has no way to choose where to save.")
            }
        }

        @JavascriptInterface
        fun copyText(text: String) {
            val clip = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clip.setPrimaryClip(ClipData.newPlainText("Yagi Studio", text))
        }

        @JavascriptInterface
        fun printPage() = runOnUiThread {
            val printer = getSystemService(Context.PRINT_SERVICE) as PrintManager
            printer.print("Yagi Studio", web.createPrintDocumentAdapter("Yagi Studio"), PrintAttributes.Builder().build())
        }

        /** The page's background, behind the status and navigation bars. */
        @JavascriptInterface
        fun setBars(color: String) = runOnUiThread {
            val c = runCatching { Color.parseColor(color.trim()) }.getOrNull() ?: return@runOnUiThread
            root.setBackgroundColor(c)
            window.setBackgroundDrawable(null)
            val light = Color.luminance(c) > 0.5f
            if (Build.VERSION.SDK_INT >= 30) {
                val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                window.insetsController?.setSystemBarsAppearance(if (light) mask else 0, mask)
            } else {
                @Suppress("DEPRECATION")
                root.systemUiVisibility = if (light) View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
            }
        }

        @JavascriptInterface
        fun usbOpen(id: Int) = runOnUiThread {
            usb.open { problem -> if (problem == null) answer(id, true, "") else answer(id, false, problem) }
        }

        @JavascriptInterface
        fun usbWrite(base64: String): Boolean = usb.write(Base64.decode(base64, Base64.NO_WRAP))

        @JavascriptInterface
        fun usbClose() = usb.close("closed")
    }

    /** Android adds .txt to a file saved as text/plain, which would turn model.stl into model.stl.txt. */
    private fun typeToSave(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "txt" -> "text/plain"
        "json" -> "application/json"
        "csv" -> "text/csv"
        else -> "application/octet-stream"
    }

    private fun post(script: String) = web.post { web.evaluateJavascript(script, null) }

    private fun answer(id: Int, ok: Boolean, message: String) =
        post("DuvBridge.done($id,$ok,${JSONObject.quote(message)})")

    @Deprecated("The picker's answers still come here for an Activity without the androidx result API.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        val uri = if (resultCode == RESULT_OK) data?.data else null
        when (requestCode) {
            PICK_FILE -> {
                picking?.onReceiveValue(uri?.let { arrayOf(it) })
                picking = null
            }
            SAVE_FILE -> {
                val job = saving ?: return
                saving = null
                if (uri == null) answer(job.id, true, "") else thread {
                    val wrote = runCatching {
                        contentResolver.openOutputStream(uri, "wt")!!.use { it.write(job.text.toByteArray()) }
                    }
                    answer(job.id, wrote.isSuccess, if (wrote.isSuccess) "saved" else (wrote.exceptionOrNull()?.message ?: "It couldn't be written."))
                }
            }
        }
    }

    /** Back closes a dialog, then returns to the last tab, then leaves the app with its state intact. */
    @Deprecated("Still called: this app doesn't opt in to predictive back.")
    override fun onBackPressed() {
        web.evaluateJavascript("DuvBridge.back()") { closed ->
            when {
                closed == "true" -> Unit
                web.canGoBack() -> web.goBack()
                else -> moveTaskToBack(true)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        usb.close("closed")
        web.destroy()
        super.onDestroy()
    }
}
