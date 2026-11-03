"""
Optional local helper for Yagi Studio. The app runs fine by opening dist/yagi-studio.html directly;
this adds one thing a page can't do alone: running nec2++ for a cross-check.

    python serve.py [port]     -> http://localhost:8910, with a "Check with nec2++" button in the app

Standard library only. It listens on this PC alone (127.0.0.1) and runs nec2++ only on decks sent
to /api/nec2, in a temporary folder.
"""
import json
import os
import subprocess
import sys
import tempfile
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
NEC_EXE = os.environ.get("NEC2PP", str(Path.home() / "Tools" / "yagicad_dl" / "yc633" / "nec2++.exe"))     # YagiCAD 6's copy
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8910
PAGE = HERE / "dist" / "yagi-studio.html"
MAX_DECK = 200_000      # bytes: a deck for a Yagi is a few kilobytes


def parse(txt, freqs):
    """Reads nec2++'s output: input impedance, and gain forward and back, per frequency."""
    out = []
    blocks = txt.split("ANTENNA INPUT PARAMETERS")[1:]
    for f, b in zip(freqs, blocks):
        # the row after the "(WATTS)" header: tag, segment, V re/im, I re/im, Z re/im, ...
        row = b[b.index("(WATTS)"):].splitlines()[1].split()
        zin = complex(float(row[6]), float(row[7]))
        pat = b[b.index("RADIATION PATTERNS"):].splitlines()
        g = {}
        for line in pat[1:]:
            p = line.split()
            try:
                g[round(float(p[1]))] = float(p[4])   # theta, phi, vert, horiz, total
            except (ValueError, IndexError):
                if g:
                    break
        out.append(dict(f=f, zin=zin, gain_dbd=g[0] - 2.15, fb=g[0] - g[180]))
    return out


def run_deck(deck):
    """Runs a NEC deck and returns one row per frequency on its FR card."""
    fr = next(line.split() for line in deck.splitlines() if line.startswith("FR"))
    count, start, step = int(fr[2]), float(fr[5]), float(fr[6])
    freqs = [start + i * step for i in range(count)]
    with tempfile.TemporaryDirectory() as d:
        inp, out = os.path.join(d, "in.nec"), os.path.join(d, "out.txt")
        Path(inp).write_text(deck)
        subprocess.run([NEC_EXE, f"-i{inp}", f"-o{out}"], check=True, capture_output=True, timeout=120)
        rows = parse(Path(out).read_text(), freqs)
    return [dict(f=r["f"], z=[r["zin"].real, r["zin"].imag], gain_dbd=r["gain_dbd"], fb=r["fb"]) for r in rows]


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body, kind="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/":
            self.reply(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/api/ping":
            self.reply(200, dict(ok=True, nec2=os.path.exists(NEC_EXE)))
        else:
            self.reply(404, dict(error="Not found"))

    def do_POST(self):
        if self.path != "/api/nec2":
            return self.reply(404, dict(error="Not found"))
        size = int(self.headers.get("Content-Length", 0))
        if size > MAX_DECK:
            return self.reply(413, dict(error="That deck is too large"))
        try:
            self.reply(200, dict(rows=run_deck(self.rfile.read(size).decode())))
        except FileNotFoundError:
            self.reply(500, dict(error=f"nec2++ not found at {NEC_EXE}. Set NEC2PP to its path."))
        except Exception as err:     # a bad deck should come back as a message, not a dead server
            self.reply(500, dict(error=str(err)))

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if not PAGE.exists():
        sys.exit("Build it first: python build.py")
    url = f"http://localhost:{PORT}"
    print(f"Yagi Studio at {url}  (Ctrl+C to stop)")
    webbrowser.open(url)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
