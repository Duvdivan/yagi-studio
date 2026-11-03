# Yagi Studio for Android

Yagi Studio as an Android app. It runs entirely on the phone, with no server and no network: the app doesn't even ask for internet permission. The solver, the interface and the charts are the same code as the web version in `../src/`, running in Android's WebView and its worker threads.

## Installing it

Build the APK as below, copy it to your phone and open it. Android will ask you to allow installs from whichever app opened it (Files, for example), because it isn't from the Play Store. It needs Android 8 or newer.

Your designs are kept on the phone, inside the app. Uninstalling removes them, so use Save to keep a copy first.

## What the Android side adds

A WebView can run the page but lacks a few things, so `MainActivity.kt`, `UsbSerial.kt` and `../src/android-shim.js` provide them:

| Feature | How |
|---|---|
| Opening files | Android's file picker, for any file type, since phones don't know `.s1p` or `.nec` |
| Saving files | Android's "save to" screen. Links to generated files do nothing in a WebView |
| The NanoVNA | USB through an OTG adapter, with Android's USB host API. `engine.js` uses the same Web Serial calls as on a PC, and the shim answers them |
| Printing the cut list | Android's print screen, which can also save a PDF |
| Fonts | Inside the APK, under `assets/fonts/`, with their licences |
| Screen edges | The page keeps clear of the status and navigation bars, whose colours follow its theme |
| Back button | Closes a dialog, then returns to the last tab, then leaves the app without closing it |

Plugging in a NanoVNA offers to open the app. Links to the web, such as NanoVNA-Saver's page, open in the phone's browser.

## How much has been tested

On an Android 15 emulator, in its real WebView (Chrome 124), `../tests/android_device.js` passes on: the page and its fonts loading with no network, the solver in 5 worker threads giving the PC's numbers, bent rods through the general solver, WebGL, the network picker, saving and opening files through Android's own screens, the cutting guide from calibration to a saved STL, printing, rotation, night mode, the Back button, and designs surviving a stop. The release APK was run too, for starting, saving and returning.

**Not tested:**

- **The NanoVNA's USB link on real hardware.** An emulator has no USB. `UsbSerial.kt` has only been compiled and run with nothing plugged in, and the page's side of it has only met a stand-in for the firmware's answers.
- **A real phone.** It's all been on an emulator, so touch feel, speed and real screens are still to try.

An edit reaches storage about a second after it's made. Force-stopping the app within that second loses that edit, and nothing before it.

## Building it

It needs JDK 17 and the Android SDK with platform 35. Gradle fetches the build tools it wants (34.0.0). Point `JAVA_HOME` and `ANDROID_HOME` at them:

```
python studio/build.py                     # writes the app's page into app/src/main/assets
cd studio/android
gradlew assembleDebug                      # app/build/outputs/apk/debug/app-debug.apk
gradlew assembleRelease                    # app/build/outputs/apk/release/app-release.apk: copy to studio/dist/YagiStudio.apk
```

A release build is signed with the key named in `~/.duvyagi/keystore.properties`, which stays out of the repository, or with the debug key if that's missing. Android only installs an update over an app signed with the same key, so keep that key: without it, installing a new version means uninstalling the old one first.

A debug build lets `chrome://inspect` look inside the page.
