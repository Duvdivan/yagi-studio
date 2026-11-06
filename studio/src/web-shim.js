/*
 * The page as an installable web app. Only the build in dist/web carries this file, and it goes first,
 * so that the rest finds these in place.
 *
 *  - works offline, through the service worker in sw.js (which only runs over https or on localhost).
 *  - saving files on iPhones and iPads, through the share sheet: a link to a generated file isn't
 *    dependable once the page is on the home screen.
 *  - telling Apple's devices apart. iOS has no install button, so people have to be told how, and iPads
 *    call themselves Macs.
 *  - a visit counter, GoatCounter (goatcounter.com), so the owner can see how many people use it. It's one
 *    image request per visit, with no script from elsewhere, no cookies and nothing stored on the device, so
 *    it needs no consent banner. It counts only on the published site, never on a copy someone serves
 *    themselves, in the Android app or under test, and not for anyone whose browser asks not to be tracked.
 */
(function (root) {
  "use strict";
  const HINT_KEY = "yagi-studio-install-hint-closed";
  const COUNTER = "yagi-studio";                    // the GoatCounter site code: counts go to https://yagi-studio.goatcounter.com
  const COUNTED_ON = "duvdivan.github.io";           // the published site; anywhere else counts nothing
  const nav = root.navigator;
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const installed = () => (root.matchMedia && matchMedia("(display-mode: standalone)").matches) || nav.standalone === true;

  /* Resolves true once saved and false if the person backed out. Resolves null where the share sheet
     can't take the file, and the page then falls back to a link. */
  async function save(name, text) {
    if (!ios || !nav.canShare) return null;
    const file = new File([text], name, { type: "application/octet-stream" });
    if (!nav.canShare({ files: [file] })) return null;
    try {
      await nav.share({ files: [file] });
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
      return null;
    }
  }

  root.ysWeb = { ios, save };

  /* One hit: "/" for a visit in a browser, "/installed" for one from the home screen, and the "install" event
     when someone installs it. Offline, the request fails quietly. */
  function count(path, event) {
    try {
      if (!COUNTER || root.location.hostname !== COUNTED_ON || nav.webdriver) return;
      if (nav.doNotTrack === "1" || root.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
      const q = { p: path, t: event ? path : document.title, r: event ? "" : document.referrer, e: event ? "true" : "",
        s: [root.screen.width, root.screen.height, root.devicePixelRatio || 1].join(","), rnd: Math.random().toString(36).slice(2) };
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = `https://${COUNTER}.goatcounter.com/count?` + Object.keys(q).filter((k) => q[k] !== "").map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
    } catch (e) { /* counting never gets in the way */ }
  }
  root.ysWeb.count = count;
  root.addEventListener("load", () => count(installed() ? "/installed" : "/"));
  root.addEventListener("appinstalled", () => count("install", true));

  function closedBefore() {
    try { return !!localStorage.getItem(HINT_KEY); } catch (e) { return false; }
  }

  function hint(html, onReady) {
    if (closedBefore() || document.querySelector(".install-hint")) return;
    const bar = document.createElement("div");
    bar.className = "install-hint";
    bar.innerHTML = `<span>${html}</span><button class="btn" data-hint-close>Not now</button>`;
    const close = () => {
      bar.remove();
      try { localStorage.setItem(HINT_KEY, "1"); } catch (e) { /* it comes back next time */ }
    };
    bar.querySelector("[data-hint-close]").onclick = close;
    document.querySelector("main").prepend(bar);
    if (onReady) onReady(bar, close);
  }

  /* Chrome and Edge offer to install when they judge the page ready. Safari never does. */
  let offer = null;
  root.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e;
    const show = () => hint('Install this as an app, to use it with no network. <button class="btn" data-hint-install>Install</button>', (bar, close) => {
      bar.querySelector("[data-hint-install]").onclick = async () => {
        offer.prompt();
        await offer.userChoice;
        offer = null;
        close();
      };
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
  });

  document.addEventListener("DOMContentLoaded", () => {
    // iOS zooms the page into any field under 16 px, and the rods table is too tight for 16 px. This
    // stops only that: iOS ignores it for pinching, so people can still zoom in themselves.
    if (ios) document.querySelector('meta[name="viewport"]').content += ", maximum-scale=1";
    if (ios && !installed()) hint("To use this with no network, install it: in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.");
  });

  if ("serviceWorker" in nav && root.isSecureContext) {
    root.addEventListener("load", () => {
      // look for a new build on opening, as the browser's own check can be put off for a long time, and
      // on coming back, as a home screen app often resumes without loading again
      nav.serviceWorker.register("sw.js").then((reg) => {
        const look = () => { reg.update().catch(() => { /* no network: the next time */ }); };
        look();
        document.addEventListener("visibilitychange", () => { if (!document.hidden) look(); });
      }).catch(() => { /* it still works, but only with a network */ });
      // designs live in this browser's storage: ask that it not be cleared to make room
      if (nav.storage && nav.storage.persist) nav.storage.persist().catch(() => {});
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
