"""
Builds Yagi Studio into one self-contained HTML file: no server, no install, works offline.

    python build.py          -> dist/yagi-studio.html  (double-click to run)
                                dist/artifact.html     (the same page, without the document wrapper)
                                android/app/src/main/assets/index.html  (the Android app's page)
                                dist/web/                (the installable web app, to put on an https host)

The worker's code is carried inside the page as text and started from a blob, because browsers
won't load a worker from a file:// address.
"""
import base64
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
PAGE_SCRIPTS = ["solver.js", "crooked.js", "rf.js", "radio.js", "guide.js", "pole-socket.js", "mast-clamp.js", "parts.js", "tasks.js", "charts.js", "view3d.js", "layout2d.js", "engine.js",
                "app-core.js", "app-radio.js", "app-design.js", "app-tune.js", "app-tools.js", "app-main.js"]
WORKER_SCRIPTS = ["solver.js", "crooked.js", "rf.js", "tasks.js", "worker.js"]
FONTS = ('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600'
         '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">')
ANDROID_FONTS = (("Barlow Condensed", "600", "barlow-condensed-600.woff2"), ("IBM Plex Mono", "400", "ibm-plex-mono-400.woff2"),
                 ("IBM Plex Mono", "500", "ibm-plex-mono-500.woff2"), ("IBM Plex Sans", "400 600", "ibm-plex-sans.woff2"))


def read(name):
    text = (SRC / name).read_text(encoding="utf-8")
    assert "</script" not in text.lower(), f"{name} would end its script tag early"
    return text


def page(title="Yagi Studio", fonts=FONTS, shim=""):
    style = (SRC / "style.css").read_text(encoding="utf-8")
    body = (SRC / "body.html").read_text(encoding="utf-8").replace("Yagi Studio", title)
    worker = "\n".join(read(n) for n in WORKER_SCRIPTS)
    scripts = "\n".join(read(n) for n in PAGE_SCRIPTS)
    # the 3D print tab's geometry library, as text until someone asks for parts
    wasm = base64.b64encode((SRC / "vendor" / "manifold.wasm").read_bytes()).decode("ascii")
    library = (f'<script type="text/plain" id="ys-manifold-js">\n{read("vendor/manifold.js")}\n</script>\n'
               f'<script type="text/plain" id="ys-manifold-wasm">{wasm}</script>\n')
    # the page's own title, styles and fonts first: only the top of the file is scanned for a title
    return (f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{fonts}\n<style>\n{style}</style>\n'
            f'{body}\n<script type="text/plain" id="ys-worker-src">\n{worker}\n</script>\n{library}<script>\n{shim}{scripts}\n</script>\n')


def document(inner):
    """The page as a whole file. The hosted version gets its wrapper from the host."""
    head, rest = inner.split("<style>", 1)
    style, after = rest.split("</style>", 1)
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{head}<style>{style}</style>\n</head>\n<body>\n{after}</body>\n</html>\n')


def android():
    """The app's page: its fonts travel inside the APK, and the WebView's gaps are filled first."""
    faces = "".join(f"@font-face {{ font-family: '{family}'; font-weight: {weight}; font-display: swap; "
                    f"src: url(fonts/{file}) format('woff2'); }}\n" for family, weight, file in ANDROID_FONTS)
    out = HERE / "android" / "app" / "src" / "main" / "assets"
    out.mkdir(parents=True, exist_ok=True)
    full = document(page("Yagi Studio", f"<style>\n{faces}</style>", read("android-shim.js") + "\n"))
    (out / "index.html").write_text(full, encoding="utf-8")
    print(f"android/app/src/main/assets/index.html  {len(full) / 1024:.0f} KB")


def web():
    """The installable web app: the page, with its fonts, icons and service worker beside it."""
    fonts = HERE / "android" / "app" / "src" / "main" / "assets" / "fonts"
    out = HERE / "dist" / "web"
    shutil.rmtree(out, ignore_errors=True)
    (out / "fonts").mkdir(parents=True)
    (out / "icons").mkdir()
    for f in fonts.iterdir():
        shutil.copy(f, out / "fonts" / f.name)
    for f in (SRC / "icons").iterdir():
        shutil.copy(f, out / "icons" / f.name)
    shutil.copy(HERE / "LICENSE", out / "LICENSE")
    shutil.copy(SRC / "site-README.md", out / "README.md")
    # iOS's default status bar style keeps the page below the bar, so the top needs no inset
    head = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<meta name="theme-color" content="#16324F">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
            '<meta name="apple-mobile-web-app-title" content="Yagi Studio">\n'
            '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
            '<link rel="icon" href="icons/icon-192.png">\n')
    faces = "".join(f"@font-face {{ font-family: '{family}'; font-weight: {weight}; font-display: swap; "
                    f"src: url(fonts/{file}) format('woff2'); }}\n" for family, weight, file in ANDROID_FONTS)
    full = document(page("Yagi Studio", f"{head}<style>\n{faces}</style>", read("web-shim.js") + "\n"))
    (out / "index.html").write_text(full, encoding="utf-8")
    (out / "manifest.webmanifest").write_text(json.dumps({
        "name": "Yagi Studio",
        "short_name": "Yagi Studio",
        "description": "A Yagi antenna simulator and tuning assistant that runs on your device.",
        "id": "./",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#16324F",
        "theme_color": "#16324F",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }, indent=2) + "\n", encoding="utf-8")
    files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file())
    worker = (SRC / "sw.js").read_text(encoding="utf-8")
    version = hashlib.sha256(worker.encode() + b"".join((out / f).read_bytes() for f in files)).hexdigest()[:12]
    worker = worker.replace("__VERSION__", version).replace("__FILES__", json.dumps(files))
    (out / "sw.js").write_text(worker, encoding="utf-8")
    print(f"dist/web/  {len(full) / 1024:.0f} KB page, {len(files) + 1} files, version {version}")


def main():
    dist = HERE / "dist"
    dist.mkdir(exist_ok=True)
    inner = page()
    (dist / "artifact.html").write_text(inner, encoding="utf-8")
    full = document(inner)
    (dist / "yagi-studio.html").write_text(full, encoding="utf-8")
    print(f"dist/yagi-studio.html  {len(full) / 1024:.0f} KB")
    android()
    web()


if __name__ == "__main__":
    main()
