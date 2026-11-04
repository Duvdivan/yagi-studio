/*
 * The web app's service worker: keeps every file on the device, so it opens with no network.
 *
 * build.py fills in the file list and a version made from the files' contents. A new build therefore
 * makes this file differ, which is how the browser notices an update. It fetches the new files in the
 * background, and they take over the next time the app is opened: a page already open is one file and
 * carries on as it is, so nobody loses work in the middle of something.
 */
const VERSION = "70affd344844";
const FILES = ["LICENSE", "README.md", "fonts/OFL-barlow-condensed.txt", "fonts/OFL-ibm-plex-mono.txt", "fonts/OFL-ibm-plex-sans.txt", "fonts/barlow-condensed-600.woff2", "fonts/ibm-plex-mono-400.woff2", "fonts/ibm-plex-mono-500.woff2", "fonts/ibm-plex-sans.woff2", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest"];
const CACHE = "yagi-studio-" + VERSION;

self.addEventListener("install", (e) => {
  // "reload" skips the browser's web cache, or a new version could store the previous one's files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((n) => n.startsWith("yagi-studio-") && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const wanted = e.request.mode === "navigate" ? "index.html" : e.request;
  e.respondWith(caches.open(CACHE).then((c) => c.match(wanted, { ignoreSearch: true })).then((hit) => hit || fetch(e.request)));
});
