# Yagi Studio

A Yagi antenna simulator and tuning assistant that runs entirely on your device. Design a beam, optimize it, see what build errors will do to it, get a cut list and a printable cutting guide, and, once it's built, work out from your VNA readings what to change.

It has presets for MeshCore and Meshtastic networks, and works at any frequency you type in.

**Open it: <https://duvdivan.github.io/yagi-studio/>**

## Install it

Open it once with a network, then install it, and it runs with no network after that.

- **iPhone or iPad:** in Safari, tap Share, then Add to Home Screen.
- **Android, or Chrome and Edge on a computer:** use the Install button in the page, or the browser's menu.

Designs stay in your browser on that device, so use Save to keep a copy.

## What to know first

- **Trust a VNA over any model.** The solver matches other references closely, but it hasn't been proven against built hardware. The one antenna measured so far has its best match about 9 MHz above the prediction, and the cause isn't known yet. "How far to trust it" in the app has the details.
- **Testing:** it has run in desktop Chrome and in Safari's engine on a PC. It's new on real iPhones and iPads, so please report what doesn't work in this repository's Issues.
- **NanoVNA:** Connect NanoVNA works over USB in desktop Chrome and Edge. iPhones and iPads don't allow it, so save a `.s1p` file and load that.
- **Power limits** shown in the app are a rough guide, not legal advice. Check your local rules.

If you put an antenna on a roof or mast, keep it well clear of power lines all the way up and down, and follow your local rules on grounding and lightning protection.

## The source

It's all in [`studio/`](studio/): `python studio/build.py` rebuilds this page from it, and [`studio/README.md`](studio/README.md) covers the solver, how it was checked and how to run the tests. The Android app is in [`studio/android/`](studio/android/).

## New and untested: the 3D print tab

The app can make printable files for a design's boom and mount. Nothing from that tab has been printed yet, so print one, measure it and test-fit it before you rely on it.

## License

Copyright (C) 2026 Duvdivan.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE).

The fonts in `fonts/` are under the SIL Open Font License, with their licences beside them. The Gradle wrapper in `studio/android/gradle/` is under the Apache License 2.0, and so is Manifold, the geometry library behind the 3D print tab, in `studio/src/vendor/` with its licence.
