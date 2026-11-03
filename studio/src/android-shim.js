/*
 * The page inside the Android app: what a WebView lacks, over the bridge in MainActivity.kt. Only the
 * app's build of the page carries this file, and it goes first, so that the rest finds these in place.
 *
 *  - navigator.serial, over USB. The NanoVNA code in engine.js stays as it is on the web.
 *  - saving files, through Android's own "save to" screen. Blob links do nothing in a WebView.
 *  - copying and printing.
 *  - the system bars taking the page's background, and the Back button closing dialogs.
 */
(function (root) {
  "use strict";
  const B = root.DuvAndroid;
  if (!B) return;

  /* Calls that Android answers later, once someone has picked a file or given a permission. */
  const pending = new Map();
  let nextId = 1;
  const ask = (method, ...args) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    B[method](id, ...args);
  });

  let usbIn = null;           // the open port's stream controller

  root.DuvBridge = {
    done(id, ok, message) {
      const p = pending.get(id);
      pending.delete(id);
      if (!p) return;
      if (ok) p.resolve(message); else p.reject(new Error(message));
    },
    usbData(base64) {
      if (!usbIn) return;
      const text = atob(base64), bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      usbIn.enqueue(bytes);
    },
    usbClosed() {
      if (usbIn) { try { usbIn.close(); } catch (e) { /* already closed */ } }
      usbIn = null;
    },
    /** Back: closes a dialog if one is open. Android does the rest. */
    back() {
      const open = document.querySelector(".modal-back");
      if (!open) return false;
      open.remove();
      return true;
    },
  };

  class UsbPort {
    async open() {
      await ask("usbOpen");
      this.readable = new ReadableStream({ start: (c) => { usbIn = c; } });
      this.writable = new WritableStream({
        write: (bytes) => {
          let text = "";
          for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
          if (!B.usbWrite(btoa(text))) throw new Error("The NanoVNA isn't connected.");
        },
      });
    }
    async close() { B.usbClose(); }
  }
  Object.defineProperty(navigator, "serial", {
    value: { requestPort: async () => new UsbPort(), getPorts: async () => [] },
  });

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async (text) => { B.copyText(String(text)); } },
  });
  root.print = () => B.printPage();

  /* For app-core.js and friends: resolves true once saved, false if the person backed out. */
  root.ysNative = {
    platform: "android",
    save: async (name, text) => (await ask("saveFile", name, text)) === "saved",
  };

  /* The bars behind the status bar and navigation follow the page's theme, including its own switch. */
  const paintBars = () => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg");
    if (bg) B.setBars(bg);
  };
  document.addEventListener("DOMContentLoaded", () => {
    paintBars();
    new MutationObserver(paintBars).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintBars);
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
