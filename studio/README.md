# Yagi Studio

A Yagi antenna simulator and tuning assistant that runs in a browser. Design a beam, optimize it, see what build errors will do to it, get a cut list, and, once it's built, work out why it doesn't match the model and what to cut.

**To run it, open `dist/yagi-studio.html`.** It's one self-contained file with nothing to install, and it works offline (fonts fall back without internet). There's also an [Android app](android/README.md) with the same interface, which needs no server or network at all, and an [installable web app](https://duvdivan.github.io/yagi-studio/) for iPhones and iPads.

## What it does

| Tab | For |
|---|---|
| **Design** | Pick your network, and the target follows. Say what gain you want, or a range, and it finds the shortest booms that hold it, or the lowest SWR, the highest F/B or the best of both at that gain. Rods in a table or dragged in a true-scale drawing, with live SWR, gain, F/B, Smith chart, polar cuts, a 3D pattern and the pattern over ground. Pin a design to compare. |
| **3D print** | New and untested: nothing from this tab has been printed yet. Makes the boom from the design: as many sections as your bed needs, a V on top with a mark for each rod's length, two notches 100 mm apart to check the print with calipers, and THIS SIDE UP on its side. With a mast clamp, a hand grip or a tripod mount, a hole coupon and build notes, as STL files. |
| **Optimize** | The same gain search, then raises the worst gain across a band under limits on SWR, F/B and boom length, or holds the gain and works on SWR, F/B or both. **Which boom?** finds the best gain each mix of rods and boom can hold. |
| **Build check** | Simulates hundreds of builds with cutting errors, and ranks which rods matter most. |
| **Cut list** | Cut lengths and drilling positions, plus files: JSON, NEC deck, YagiCAD `.YC6`, CSV, `.s1p`. And a 3D-printed cutting guide for the rods, scaled to your printer. |
| **Tune my antenna** | Enter what you measured on your parts and what your VNA says: draw the curve, type a few numbers, load a `.s1p` or read a NanoVNA. It fits the model to those readings, says which conclusions are firm, and ranks real fixes with exact lengths. |

## What the antenna is for

It asks once, and the Frequency card can change it later. Bandwidth, spreading factor and coding rate don't change an antenna, which only sees the frequency. They decide the link, so the card shows what they're worth, with this antenna's gain. All of it is in `src/radio.js`:

- **MeshCore:** the 27 presets in the official app (the feed at `api.meshcore.nz`, as of November 2026), and local networks.
- **Meshtastic:** its 26 regions and 9 modem presets. The frequency comes from the firmware's own formula, including the slot from the hash of the channel's name.
- **Local networks:** Philly Mesh so far. To add one, add a line to `COMMUNITY`.
- **Anything else:** type a frequency, with LoRa settings if it uses LoRa.

If the frequency moves, it offers to keep the rods, for an antenna already built, or scale them, for a new build, and shows what each would give.

It also flags radiated power against the local limit where the rule is well known (USA, Canada, EU and UK, Australia and New Zealand). Those are a rough guide, not legal advice. A node's own power limit doesn't count its antenna, and a 12 dBi Yagi can put a legal radio over the limit.

## The cutting guide

A printed block with a channel and a stop for each rod length. Cut a rod a little long, then file it flush with the block's front face. `src/guide.js` makes the STL in the page, from the design's lengths.

It's only as true as the print, and 0.36% of shrinkage on a 150 mm rod is 0.54 mm, more than the rods can take. So it stays locked until you've printed a 100 mm test bar in the same filament and settings and typed in what it measures. The guide is scaled to suit, in length and width only. You then check the printed guide's length, and your first rod, before cutting the rest. A measurement more than 3% off is questioned as a likely mistake, and rods too long for your bed get no guide.

## The installable web app

It's hosted at <https://duvdivan.github.io/yagi-studio/>, from the public repository <https://github.com/Duvdivan/yagi-studio>: GitHub Pages serves the built page from the top of that repository, and this folder sits beside it as `studio/`. Opened there once, it can be added to the home screen and then runs with no network. It's the way onto iPhones and iPads, since a native iOS app needs a paid developer account, and it installs on Android and desktop Chrome too.

- **Offline:** `src/sw.js` stores every file on the device. Service workers need https (or localhost), so a page opened over plain http on a local network works but won't install or run offline.
- **Publishing:** run `python build.py`, then in a clone of that repository replace everything except `.git` and `.nojekyll` with the contents of `dist/web/` and this folder's tracked files as `studio/`. Commit and push them together, so the source always matches the page, as the licence expects.
- **Updates:** publish a new build. The app looks for a new build when it opens and when it comes back to the screen, fetches it in the background, and shows it at the next opening.
- **On Apple's devices,** `src/web-shim.js` explains how to install, since iOS has no install button, and saves through the share sheet. The file picker has no filter, because iOS greys out types it doesn't know, like `.s1p`.
- **No NanoVNA over USB:** iOS gives web pages no access to USB serial devices, and Safari has no Web Serial, so the app says so and sweeps are loaded as files. The button works in desktop Chrome and Edge.
- **Designs** stay in that browser's storage, separate from Safari's once installed, so use Save to keep a copy.

**How much has been tested:** `tests/web_app.js`, in Chrome and in desktop WebKit standing in for an iPhone and an iPad: installability, opening and solving with no network, a new build replacing the old, the same solver answers, bends, saving and loading, and the layout. **It hasn't been run on a real iPhone or iPad,** so the share sheet, Add to Home Screen, file picking from Files, offline use on iOS and printing are all untried.

## Licence

Yagi Studio (this folder) is under the GNU Affero General Public License, version 3 or later: see `LICENSE`. That doesn't reach the rest of the DuvYagi project it came from, such as the antenna's printed parts. The fonts are under the SIL Open Font License, with their licences beside them, and the Gradle wrapper under the Apache License 2.0.

## The solver

`src/solver.js` is a Galerkin moment method with Richmond's piecewise-sinusoidal basis for parallel, centre-fed rods. It differs from NEC-2 in the two ways that matter for thick rods:

- **The kernel.** The current is a tube on the rod's surface, not a filament on its axis. That is the exact kernel, whose static part is `1 / agm(sqrt(z^2 + 4a^2), |z|)`.
- **The mesh.** Panels are graded toward the rod tips, because the current has a square-root edge there.

What error remains from a coarse mesh acts like a small change in rod length, proportional to the tip panel and the same across antennas, so it is corrected. A flat-ended solid rod acts like a tube about 0.10 radii longer per end, measured with `tests/bor_reference.py`.

A centre-fed Yagi has only even currents, which halves the unknowns. One frequency takes about 1 ms.

## How it was checked

`node tests/validate.js` runs all of this and exits non-zero on a failure:

| Check | Result |
|---|---|
| 0.2 mm rods, 6-element array, against nec2++ at 121 segments, where thin-wire theory holds | R, X within 0.03 ohm; gain 0.004 dB; F/B 0.04 dB |
| A 3.175 mm rod against `tests/bor_reference.py`, a separate model of the rod's whole surface | Open tube within 0.08 ohm; flat ends within 0.01 ohm |
| Gain from input power against the integrated pattern | Within 0.02 dB |
| Draft mesh against the finest, from 144 to 1296 MHz | Within 0.15 ohm and 0.002 dB |
| The fit, on SWR made from a known error | Directors within 0.01 mm, driven element within 0.2 mm; following its plan gives SWR 1.08 |
| The fit, on a sweep file through a cable | Cable within 0.3 mm from a guess 17 mm off; directors within 0.01 mm; driven element within 0.1 mm |
| `tests/crooked.js` on straight 3 mm rods, against this solver | R, X within 0.001 ohm; gain and F/B the same |
| `tests/crooked.js` on 15 bent, leaning and off-centre arrays of 0.2 mm rods, against nec2++ | R, X within 0.06 ohm; gain within 0.01 dB; F/B within 0.05 dB, up to a 60 degree bend |
| `tests/gap_reference.py`, the driven element's gap with a thin lead, against theory and its own mesh | Within 2 ohm of theory at 3 mm; within 0.04 ohm on a finer mesh |
| `tests/crooked.js` on closed loops, 0.2 mm rods, against nec2++: a folded dipole alone and as a Yagi's driven element | R within 0.5%; X within 2 ohm; gain within 0.01 dB; F/B within 0.05 dB |
| `src/crooked.js` in the app: all its figures against this solver on straight rods, and with a mast | Beamwidths within 0.2 degrees; front-to-rear within 0.1 dB; 3D pattern within 0.1 dB; with a mast, R, X within 0.3 ohm |
| The fit with bends entered, on readings made from a bent antenna | Directors within 0.3 mm |
| `src/guide.js`, the cutting guide's mesh, here and in trimesh, an unrelated library | Every edge used exactly twice, faces the right way out, sizes exact |
| `src/radio.js` against published numbers | Frequencies and slots exact: Meshtastic's 906.875 MHz (US LongFast), 869.525 MHz (EU), 919.875 MHz (ANZ), and Philly Mesh's 908.750 MHz, slot 14; data rates within 1 bit/s; sensitivity within 1 dB of the SX1262 datasheet |

**nec2++ doesn't converge on thick rods.** On a 3.175 mm rod at 910 MHz its feed resistance runs 53, 58, 65, 71 ohms at 21, 31, 51, 81 segments. It's still right for thin wire.

**It isn't proven against hardware yet.** The one real antenna measured so far, the DuvYagi, has its valley about 9 MHz above this solver's prediction. That is closer than nec2++'s 12 MHz, but the cause isn't known. Its rods haven't been measured yet.

## Bent rods and the driven element's gap

The Design tab takes both:

- **Bent or off-center rods:** enter how far each tip is from straight, in mm, as you'd measure it. `src/crooked.js` takes rods of any shape: each half bent any way, from where it leaves the boom. It keeps this solver's mesh and tube kernel and drops the two shortcuts that need straight, parallel, centered rods, so one frequency takes tens of milliseconds rather than 1 ms. Enter none, and the fast solver runs.
- **The Tune tab** suggests bends when they'd help. Its fit keeps to the fast solver, adding what any bends you've entered do to the feed impedance, as worked out once. **Build check** can add random bends. **Optimize** treats rods as straight, as do the NEC and YagiCAD files.
- **The gap:** changing it moves the rods, which keep their length, unless you untick that.
- **The wire across the gap:** off unless you tick it. The rod is otherwise modeled as continuous, but the current crosses on a thin wire, which adds about 3 ohm per mm of gap in series with the feed, so a driven element finishes a little shorter. `tests/gap_reference.py` solves the real shape: two flat rod faces joined by a thin lead. The app uses a formula within about 1 ohm of that from 2 to 10 mm.

The main finding is that only bends along the boom near the feed matter much. Off-centre rods, sideways bends and unequal driven rods hardly register.

`tests/crooked.js --folded` also models a folded dipole as the driven element. On the DuvYagi it gives the same gain and the same SWR bandwidth as a split element, because the directors set that bandwidth, and it needs a 4:1 balun and loses the trim on the VNA. So the app explains that rather than offering one. It may make more sense for other uses, so it could be added later.

## What it leaves out

It doesn't model extra bare leads at the feed, folded dipoles or gamma matches (`tests/crooked.js` can model a folded dipole, outside the app), a metal boom, the coax radiating, plastic around the rods, or nearby objects. The mast is a centred pipe. The pattern over ground assumes the antenna is at least a wavelength up. The NanoVNA link has been tested against a stand-in for its port that answers as the firmware's source says, but not yet on real hardware.

## Readings from a NanoVNA

Its numbered save slots hold calibrations, not sweeps. To bring a sweep in, use any of these:

- **NanoVNA-Saver** on a PC, which writes a Touchstone file (`# HZ S RI R 50`).
- **SAVE S1P** in the SD CARD menu, on a unit with a microSD slot (`# Hz S RI R 50`).
- **Connect NanoVNA** in the Tune tab, over USB, in Edge or Chrome.

R and X read through a cable are rotated by it, so the fit ignores them until a cable is entered, and then finds the cable's exact length from the sweep.

## Working on it

```
python build.py              # src/ -> dist/yagi-studio.html, dist/artifact.html (for hosting), the Android app's page and dist/web/
node tests/validate.js       # the checks above; needs Python with numpy and scipy, and uses nec2++ if present
python tests/bor_reference.py   # the surface reference on its own
python tests/gap_reference.py   # the driven element's gap on its own
node tests/find_gain.js      # the search for a gain (a few minutes on one thread)
node tests/print_parts.js    # the printable parts, against the DuvYagi's OpenCascade parts and on other designs
node tests/crooked.js        # what the gap and crooked rods do to the DuvYagi (a few minutes)
node tests/web_app.js chrome # the installable web app; the file says how to serve it, and webkit is the other choice
python serve.py              # optional: adds a "Check with nec2++" button at http://localhost:8910
```

`src/`:

- `solver.js`: the moment method. `crooked.js`: the general one, for rods that aren't straight. `rf.js`: cables, Touchstone, imports and exports, presets. `radio.js`: the networks' presets and the LoRa math. `guide.js`: the cutting guide's mesh. `tasks.js`: optimizer cost, build study, sensitivity, the fit and the tuning plan.
- `engine.js`: worker pool, the optimizer's search (jDE), the NanoVNA link.
- `parts.js`: the printable parts, with Manifold (`vendor/`, Apache 2.0) for the solids, carried in the page so that it works offline.
- `charts.js`, `view3d.js`, `layout2d.js`: drawing, with no libraries.
- `app-*.js`, `body.html`, `style.css`: the interface.
- `android-shim.js`: what a WebView lacks, in the Android app's page only. `../android/` is the app around it.
- `web-shim.js`, `sw.js`, `icons/`: the installable web app, in `dist/web/` only.

Those solver files have no DOM, so they run in the page, in workers and in Node.
