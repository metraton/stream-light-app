# Stream Light

A webcam light show for streaming: colored columns, movements and glows driven from the keyboard, captured by OBS.

## What it is and why it exists

Stream Light is a browser page (PixiJS) that slices the webcam image into colored columns and animates them. Every control is a keyboard shortcut, so the streamer plays it like an instrument. The page runs either as an OBS Browser Source or in a dedicated Chrome app window that OBS captures as a source.

Because OBS captures that window, it is usually not the focused one while streaming. Live mode solves that: `serve.py` installs a Windows keyboard hook, and live mode is on exactly while Caps Lock is on, so the keyboard's Caps light shows it on any keyboard. While live, every key the app binds is swallowed for every other program (it does not type into chat or OBS) and delivered to the page instead. Keys the app does not bind pass through normally, Caps Lock itself is never intercepted, and with Caps Lock off nothing is intercepted at all.

## Flow

```
Caps Lock pressed (any window, passes through to Windows)
  -> serve.py keyboard hook flips live mode on each press (seeded from the Caps state at startup)
  -> "live" event -> page sets the window title
  (python serve.py --debug prints one line per hook, Caps, live key and /events or /bound event;
   the page logs its side to the browser console with a [live-bridge] prefix)
key pressed in any window
  -> serve.py keyboard hook (WH_KEYBOARD_LL)
       live and bound   -> swallowed -> "key" event on /events -> resolveShortcut -> app action
       anything else    -> passes through to the focused window
page connects to /events
  -> receives every keystroke the hook could relay ("candidates")
  -> resolveShortcut (js/shortcuts.js) keeps the bound ones -> POST /bound -> hook swallows only those
```

`resolveShortcut` in `js/shortcuts.js` is the only key map: the page's own keydown listener and the relayed keys both run it, so a new shortcut works in live mode with no other change, and a key it stops binding (Shift+Backspace, M, comma) passes through again. While live, the hook swallows a bound key before Chrome sees it even when the app window is focused, so each press acts once. Relayed keys are described without Caps Lock, so Caps never acts as Shift: moods (Shift+Z X C V B N) still need Shift.

## Requirements

- Windows 10 (1607 or later) or 11, with Windows Python 3.8+ on `PATH` (not WSL Python: the hook is a Windows API). No packages to install: the hook uses `ctypes` from the standard library.
- No admin rights. One Windows limit applies: a low-level hook does not receive keys typed into a window running as administrator. If OBS runs elevated, keys typed while OBS is focused are not intercepted; run OBS unelevated or keep another window focused.
- OBS Studio 32 (measured on 32.2.2) with the Aitum Vertical plugin installed. The Browser Source needs OBS launched with `--enable-media-stream`, as in "Start streaming".
- Google Chrome, only for the `--chrome` option (the Chrome window route).
- Node.js 22 or later, only to run the tests; `tests/test_obs_merge.mjs` also needs Windows PowerShell (it finds it through WSL interop too).

## Start streaming

Each session, once OBS is set up on the machine ("Set up OBS on a new machine" below), run these from PowerShell in this order. The OBS paths are the default install.

1. Start the server with Windows Python:

   ```
   python <repo>\serve.py
   ```

2. Launch OBS with `--enable-media-stream`; without it the camera request in the Browser Source fails with "Permission denied":

   ```
   Start-Process "C:\Program Files\obs-studio\bin\64bit\obs64.exe" -ArgumentList "--enable-media-stream" -WorkingDirectory "C:\Program Files\obs-studio\bin\64bit"
   ```

   A bare quoted path followed by `--enable-media-stream` is a PowerShell parse error, so use `Start-Process`.

3. Or, instead of step 2, a shortcut with Target:

   ```
   "C:\Program Files\obs-studio\bin\64bit\obs64.exe" --enable-media-stream
   ```

   and Start in `C:\Program Files\obs-studio\bin\64bit`.

`serve.py` serves its own folder whatever the current directory is.

## How it is used

```
python serve.py --chrome
```

This serves the app at `http://localhost:8080` (bound to `127.0.0.1` only), installs the hook, and opens the Chrome app window with the profile and background-throttling flags OBS capture needs. Drop `--chrome` when OBS hosts the page in its Browser Source (the setup below); `--port` changes the port; `--debug` logs every bridge event. Ctrl+C stops it. Expected first line (live mode starts already on if Caps Lock is on):

```
Serving C:\...\stream-light-app at http://localhost:8080 (bound to 127.0.0.1). Caps Lock toggles live mode (now OFF); Ctrl+C stops.
```

The page starts on its own, with no click and no start screen, so it also runs unattended as an OBS Browser Source: it opens the first enabled camera, or shows the test pattern with a notice at the bottom (no camera, access denied, all disabled) when none can be shown. It reports its bound keys once the stage is up, and until then live mode swallows nothing.

Every row of the key grid has six keys and starts with None:

| Keys | Row | Key 1 to 6 |
|------|-----|------------|
| `\|` `1`-`5` `6` | Colors (Shift selects only that one; `6` and `Shift+6` are the same) | Empty, Yellow, Blue, Red, Green, Purple, Todos al azar (all 5 in a new random order each press; pattern and other layers untouched) |
| `Q W E R T Y` | Pattern (Shift plays its variant, shown as ⇄) | None, Chase, Carousel, Mirror, Fill, Sparkle |
| `A S D F G H J` | Movement | None, Wave, Expand, Broken, Shake, Equalizer, Zoom (Golpe de zoom: every panel swells 4% on the beat and settles) |
| `Z X C V B N` | Glow | None, Sweep, Breathe, Pulse, Strobe, Alternate |
| `Shift+Z X C V B N` | Mood | Calm, Groove, Build, Tension, Peak, Mystic (`<` is Mood None) |
| `Backspace` / `Space` | Cue | stage a new combo (colors, pattern, movement, glow, mood; BPM stays live) while the live one plays / commit it in press order (otherwise pause / resume) |
| `Escape` | Base state | no colors, every layer None, 120 BPM, playing (the first color pressed moves at once); layout, filters, rotation and FPS cap stay |
| `+` / `´`, `0`, `P` | Other | BPM up/down, next enabled camera (Shift+0 too), panel |
| `9` | Text | fade the text overlay in or out (250 ms); Shift+9 stays unbound |

One camera is on the stage at a time. `0` steps through the enabled cameras in the order of the panel's Cámaras section, where each plugged-in camera has a checkbox (in or out of the rotation) and ↑ ↓ to reorder it; ● marks the one on stage. The list follows cameras being plugged in and removed for the whole session: a new camera joins the end of the rotation enabled, and when the camera on stage is unplugged or disabled the stage moves to the next enabled one. The order and the on/off state are saved in localStorage (`streamlight-camera-order`), keyed by camera label (device id when there is none), so a camera that comes back keeps its place; on a first start an Iriun camera goes first. The rotation rules are in `js/camera-rotation.js`, tested by `tests/test_camera_rotation.mjs`.

The text overlay (`9`, or the panel's Texto section) draws the current phrase as hollow Fredoka letters outlined by a thin double line, with a glow and an optional dark band across the frame. It sits above the Pantalla layer, so screen effects never distort it. The panel sets the phrase, saved phrases (seeded with FLASH LIGHT and CANDLE LIGHT, kept in localStorage apart from presets), color (Neón, Columna = first selected color, Blanco, Custom), size, band and its opacity, position (Centro / Arriba / Abajo) and beat behavior (Fijo, Pulso al golpe, Parpadeo neón). Presets save that look as `text` but never whether it shows; a preset from before carries none and loads the defaults.

Pattern variants (`js/color-sequencer.js` `PATTERN_VARIANTS`): Carousel reversed runs the same frames backwards. Chase, Mirror, Fill and Sparkle negative swap lit and Empty columns: each selected color in turn fills the row and the columns the normal pattern lights for that color alone become gaps, so Chase is a full row with a travelling gap and Fill empties the row column by column. None has no variant, so Shift+Q is Q. A plain key always picks the normal pattern; pressing Shift again keeps the variant; moods play the normal pattern.

The tuned values in code are the app's base, and presets sit on top of it. The base state and the six moods (Calm, Groove, Build, Tension, Peak, Mystic: colors, pattern, movement, glow, BPM and per-layer rates, plus easings where set) are defined once, in `js/mood-map.js`; layout, colors, glow look, filters, effects and text look in `CONFIG` in `js/config.js`; each effect's own rate and easing in `js/effects.js`, `js/glow-sequences.js` and `PATTERN_RATES` in `js/color-sequencer.js`. `DEFAULTS` is a copy of `CONFIG` taken at load, so startup, Reset to Defaults and the Original color set all give the same values; the only exception is the layout, where a default saved from the Layout section wins until it is cleared. A preset's speed tweaks for an effect that no longer exists (the removed congelado and desfase) are dropped on load. `tests/test_defaults.mjs` pins these values.

Live state is shown only in the window title, never inside the page, because OBS Window Capture records the page content and not the title bar: `Stream Light — EN VIVO` while live, `Stream Light` when not, and `Stream Light — sin conexión` while the page has lost its connection to `serve.py`. The title is visible on the taskbar and in Alt+Tab.

Ctrl and Alt combinations are never relayed, so Ctrl+Backspace and similar keep working in other programs while live.

The panel's Color section adjusts the image like a color-grading panel: the "Todos" chip sets one global brightness, contrast, saturation, hue and temperature for every column, uncolored ones included, and each color chip adds an offset for the columns showing that color (effective value = global + offset, clamped to the slider range). A dot marks a color with an offset; Shift+click edits several colors at once; double click clears a color's offset (on "Todos", resets the global value). Offsets belong to the color slot, not the hex value. Presets saved before this model stored absolute per-color values; on load, `migrateLegacyFilters` in `js/color-filter.js` makes the global value neutral and each color's offset its old value minus neutral, so a loaded preset looks the same as before.

Tests: `node --test tests/*.mjs` (patterns, key grid, syntax, panel math, camera rotation, OBS installer and secrets) and `python -m unittest discover -s tests -v` (the file server, the bridge and the Caps Lock logic, without installing the hook).

### Set up OBS on a new machine

1. Install OBS 32 and the Aitum Vertical plugin, start OBS once, then close it.
2. Clone the repo in the Windows filesystem: `git clone https://github.com/metraton/stream-light-app.git`.
3. With OBS closed, from PowerShell:

   ```
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo>\obs\install.ps1 [-Variant nvidia|intel] [-ReelDir <folder>]
   ```

   It refuses while OBS runs and first copies `%APPDATA%\obs-studio` to `%APPDATA%\obs-studio.backup-<yyyyMMdd-HHmmss>`. What it then sets is listed under "What the installer sets".
4. Connect the YouTube account in OBS (Settings > Stream > Connect Account). The YouTube chat and YouTube Live Control Panel docks come from that sign-in, not from the installer; the installer only carries their layout.
5. In the Aitum Vertical dock, set the Instagram output's server and key. On a reinstall the existing output keeps them.
6. Turn Desktop Audio off (Settings > Audio > Desktop Audio: Disabled) if OBS created it: the set is captured from rekordbox, and Desktop Audio would add it a second time.
7. Set the obs-websocket password (Tools > WebSocket Server Settings) and enter it in the Stream Health dock's Connection settings (see `monitor/README.md`).

Then, each session, launch as in "Start streaming" above.

The Browser Source (`http://localhost:8080/`, 1920x1080) keeps "Shutdown source when not visible" unchecked, so the page never stops. `serve.py` sends `Cache-Control: no-cache` on every file, so after a `git pull` refreshing the source loads the new files. A camera can be held by one consumer at a time, so the Chrome window (`--chrome`) and the Browser Source cannot run together.

### What the installer sets

`obs/install.ps1` merges with `obs/ObsMerge.psm1`: it sets only the keys and objects it owns and leaves the rest as OBS or the user wrote it. Profiles and the collection are found by the name inside them (`[General] Name`, the collection's `name`), because OBS 32 chooses the folder and file names itself (the `stream-light` profile can live in `streamlight\`).

- Two profiles, which differ only in the YouTube video bitrate (`$Profiles` in the script):

  | Profile | Video | Use it when |
  |---------|-------|-------------|
  | `stream-light` | CBR 4500 kbps | the standard; any link |
  | `stream-light-hq` | CBR 8000 kbps | the upload is solid (wired, well above 10 Mbps) |

  Both are 1080p30 with a 2 s keyframe, reconnect every 2 s up to 25 times, dynamic bitrate on, audio at 48 kHz and AAC 320 kbps. `user.ini` keeps the active profile when it is already one of these, otherwise it selects `stream-light`.
- The encoder per graphics card: `nvidia` when `Win32_VideoController` lists an NVIDIA GPU, `intel` otherwise (`-Variant` overrides). The per-GPU files are in `obs/profile/encoders/<variant>/` and `obs/vertical/encoders/<variant>.json`.

  | Variant | Stream | Recording | Vertical stream |
  |---------|--------|-----------|-----------------|
  | `nvidia` | NVENC H.264 CBR, P5, tune hq, two-pass quarter res | NVENC HEVC, CQP 20 | NVENC H.264 CBR 3000 kbps |
  | `intel` | QuickSync H.264 CBR | QuickSync, ICQ 20 | QuickSync H.264 CBR 3000 kbps |
- Sign-ins are never touched in an existing profile: `service.json`, `[YouTube]`, `[Auth]` and `[Panels] CookieId`. A profile the script creates takes them from an installed signed-in `stream-light` profile, with a copy of that profile's browser cookie folder under a new `CookieId`, so its YouTube docks stay signed in. They are copied between installed profiles only, never into the repo.
- The dock layout in `obs/profile/stream-light/basic.ini` `[YouTube - RTMP] DockState` (YouTube chat and Live Control Panel on the left, Stream Health below them) is applied when the repo layout changed since the last install (`[StreamLight] DockStateHash` in the profile), so a layout you arrange in OBS survives a reinstall.
- The scene collection `stream-light-scenes` (`obs/scenes/stream-light-scenes.json`): repo sources are updated by uuid or name; sources, scene items, hotkeys and transitions you added are kept.
- The Stream Health dock in `user.ini` and `BrowserHWAccel=false` in `global.ini`: with Browser Source hardware acceleration on (OBS 32.2.2) the stage rendered shifted on the Intel laptop and garbled on the NVIDIA PC.
- Aitum Vertical (`plugin_config\vertical-canvas\config.json`): canvas 720x1280, backtrack 120 s to `-ReelDir` (default `%USERPROFILE%\Videos\reel-raw`), the variant's canvas-level stream encoder. The Instagram output is the one whose server is Instagram's, else the only output; it is never edited, and one named `Instagram` is added only when none exists.

`tests/test_obs_merge.mjs` runs the installer twice on a copy of a laptop-shaped settings folder with fake secrets and checks that keys, sign-ins and the active profile and collection survive with no duplicates.

### Audio, vertical and outputs

The set's audio is "Application Audio Capture (BETA)" on rekordbox, matched by executable (`"priority": 2`, "Match title, otherwise find window of same executable"), so it survives rekordbox updates that change the window title or class. It is on track 1 only; Mic/Aux stays in the collection but starts muted.

The Aitum Vertical canvas is 720x1280, and its "Vertical Scene" shows the same Browser source as the main scene (a reference, not a second browser), rotated 270 degrees and scaled to fill it. The backtrack keeps the last 120 s; its save hotkey is stored as `OBS_KEY_SLASH`, the `/` key on a US layout and `}` on a Latin American one.

The main OBS Replay Buffer is on, 20 s and 512 MB (`RecRB`, `RecRBTime`, `RecRBSize` in the common `basic.ini`, asserted by `tests/test_obs_secrets.mjs`), because the Aitum backtrack depends on it: without it the plugin logs "Can't start backtrack when no replay buffer is found". The installer only turns `RecRB` on; the length and size you set are kept.

Start the outputs one at a time. With the stream, auto-recording, the Replay Buffer and the backtrack all starting within the same ~300 ms, OBS 32.2.2 crashed on its video thread (exception `c0000005` in `default_raw_video_callback`, `obs.dll`). Untick Settings > Advanced > Recording > "Automatically record when streaming", then start the Replay Buffer, wait a few seconds, start streaming, and start recording last.

No secret lives in the repo: `obs/profile/stream-light/service.example.json` has an empty `key`, `.gitignore` excludes `obs/profile/*/service.json`, and `tests/test_obs_secrets.mjs` fails when any file under `obs/` holds a stream key or server field, or a YouTube section with anything but `DockState`.

### Stream health monitor dock

`monitor/` is a separate page that runs as an OBS custom dock (the installer adds it as `Stream Health`), reading obs-websocket on port 4455 with a password. `monitor/README.md` gives the current `<BUILD>` value, the steps and what the dock shows.

## Structure

```
index.html          page shell and the no-camera notice
panel.css           control panel styles
serve.py            file server + keyboard hook (Caps Lock live mode) + /events and /bound bridge, one process
js/main.js          entry point: one page at a time (Web Lock), then starts the app with no click
js/camera-rotation.js camera rotation rules for key 0 and the Cámaras section: order, on/off, unplugged cameras, saved order
js/app.js           StreamLightApp: wires engines, panel, shortcuts and the live bridge
js/shortcuts.js     resolveShortcut, the single key map, and the keydown listener
js/live-bridge.js   page side of live mode: reports bound keys, runs relayed keys, sets the window title
js/glow-map.js      glow quick keys shared by shortcuts and the panel
js/mood-map.js      the base state and the moods, shared by the app, shortcuts and the panel
js/color-filter.js  Color panel model: global filter + per-color offsets, effective values, old-preset migration
js/overlay-text.js  text overlay model: settings and their preset restore, saved phrases, fade, beat pulse, seeded flicker
js/overlay.js       text overlay rendering: double-outline phrase, glow and band above the screen layer
js/panel/           control panel sections
monitor/            OBS custom dock: stream health of the main and Aitum outputs, with its own README
obs/                OBS profiles (common + per-GPU encoder variants), scene collection, Aitum Vertical template, install.ps1 and its merge rules ObsMerge.psm1, with keys and tokens removed
js/*.js             rendering engines: columns, effects, glow, color sequencer, camera
tests/test_serve.py    tests for the file server, the bridge and the Caps Lock live-mode logic
tests/test_patterns.mjs tests for the color patterns, the key grid and JS syntax
tests/test_color_filter.mjs tests for the Color panel math and the old-preset migration
tests/test_text_overlay.mjs tests for the text overlay's phrases, preset restore, fade, flicker and key 9
tests/test_defaults.mjs tests that startup, Reset to Defaults, Original and old presets share the tuned base
tests/test_camera_rotation.mjs tests for the camera rotation: order, disabled cameras, unplug and plug, saved order, key 0
tests/test_obs_secrets.mjs fails if a file under obs/ carries a stream key, server or YouTube token, or turns the Replay Buffer off
tests/test_obs_merge.mjs runs the merge rules and the real installer on tests/fixtures/obs/ (fake secrets) and checks what it keeps and updates
```

## Ownership

Personal project of Jorge Aguilar. No license granted.
