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

- Windows 10 (1607 or later) or 11, Python 3.8+ on `PATH`. No packages to install: the hook uses `ctypes` from the standard library.
- No admin rights. One Windows limit applies: a low-level hook does not receive keys typed into a window running as administrator. If OBS runs elevated, keys typed while OBS is focused are not intercepted; run OBS unelevated or keep another window focused.
- OBS Studio (measured on 32.2.2). The Browser Source route needs OBS launched with `--enable-media-stream`, see below.
- Google Chrome, for the `--chrome` option (the Chrome window route).
- Node.js 22 or later, only to run the pattern tests.

## How it is used

```
python serve.py --chrome
```

This serves the app at `http://localhost:8080` (bound to `127.0.0.1` only), installs the hook, and opens the Chrome app window with the profile and background-throttling flags OBS capture needs. Drop `--chrome` to open the window yourself or to host the page in OBS (see "Running it as an OBS Browser Source"); `--port` changes the port; `--debug` logs every bridge event. Ctrl+C stops it. Expected first line (live mode starts already on if Caps Lock is on):

```
Serving C:\...\stream-light-app at http://localhost:8080 (bound to 127.0.0.1). Caps Lock toggles live mode (now OFF); Ctrl+C stops.
```

The page starts on its own, with no click, so it also runs unattended as an OBS Browser Source: it opens the first enabled camera, or shows the test pattern with a notice at the bottom (no camera, access denied, all disabled) when none can be shown. It reports its bound keys once the stage is up, and until then live mode swallows nothing.

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

Tests (the file server, the bridge and the Caps Lock logic, without installing the hook): `python -m unittest discover -s tests -v`. Pattern, key-grid and syntax tests, without a browser: `node --test tests/test_patterns.mjs`. Color panel math: `node --test tests/test_color_filter.mjs`.

### Running it as an OBS Browser Source

OBS can host the page itself instead of capturing a Chrome window:

1. Start the server without `--chrome`: `python serve.py` (Windows).
2. In OBS add a Browser Source with URL `http://localhost:8080/`, width 1920 and height 1080, then press Ctrl+R on it (Reset Transform) so it fills the canvas.
3. Launch OBS with `--enable-media-stream`; without it the camera request in the source fails with "Permission denied". From PowerShell (the paths are the default install, adjust them to yours):

   ```
   Start-Process "C:\Program Files\obs-studio\bin\64bit\obs64.exe" -ArgumentList "--enable-media-stream" -WorkingDirectory "C:\Program Files\obs-studio\bin\64bit"
   ```

   For a shortcut, set Target to `"C:\Program Files\obs-studio\bin\64bit\obs64.exe" --enable-media-stream` and Start in to `C:\Program Files\obs-studio\bin\64bit`.
4. In the source's properties leave "Shutdown source when not visible" unchecked, so the page never stops.
5. After a `git pull`, refreshing the source loads the new files: `serve.py` sends `Cache-Control: no-cache` on every file, so OBS revalidates instead of reusing a cached module (a stale cached `color-controls.js` once broke the page with `does not provide an export named 'colorHex'`). "Refresh cache of current page" is no longer needed.

A camera can be held by one consumer at a time, so the Chrome window (`--chrome`) and the Browser Source cannot run together: use one or the other.

Hardware acceleration stays off on both PCs: with "Enable Browser Source Hardware Acceleration" on (OBS 32.2.2), the stage rendered shifted by half its width on the Intel-only i7-1260P laptop and garbled on the NVIDIA PC. `obs\install.ps1` turns it off for either variant by writing `BrowserHWAccel=false` under `[General]` in `%APPDATA%\obs-studio\global.ini`; by hand it is Settings > Advanced > Sources, then restart OBS.

### Import the OBS profile and scenes

`obs/` holds the OBS setup both streaming PCs share; only the encoder differs by GPU. `obs/profile/stream-light/` is the common part of the profiles (output, video and audio settings, dock layout); `obs/profile/encoders/<variant>/` holds the per-GPU part: `streamEncoder.json`, `recordEncoder.json` and `basic-overrides.ini` (the `[AdvOut]` encoder ids and the 320 kbps track 1 audio). `obs/scenes/stream-light-scenes.json` is the scene collection `stream-light-scenes`; `obs/vertical/` is the Aitum Vertical template (`canvas.json` plus `encoders/<variant>.json`).

`install.ps1` writes two profiles from those same files; they differ only in the YouTube video bitrate, set by `$Profiles` in the script:

| Profile | Video | Use it when |
|---------|-------|-------------|
| `stream-light` | CBR 4500 kbps | the standard; any link, and the one `user.ini` makes active |
| `stream-light-hq` | CBR 8000 kbps | the upload is solid (wired, well above 10 Mbps) |

Switch with the Profile menu in OBS, or launch with `--profile stream-light-hq`. Both are 1080p30 with a 2 s keyframe, reconnect every 2 s up to 25 times, dynamic bitrate on, audio at 44.1 kHz (rekordbox's rate) and AAC 320 kbps for the DJ set.

| Variant | Stream | Recording |
|---------|--------|-----------|
| `nvidia` | NVENC H.264 CBR, P5, tune hq, two-pass quarter res, profile high | NVENC HEVC, CQP 20 |
| `intel` | QuickSync H.264 CBR | QuickSync, ICQ 20 |

A setting both PCs share goes in the common `basic.ini`; a setting that depends on the GPU goes in each variant, never in both places.

The set's audio is "Application Audio Capture (BETA)" on rekordbox (window `[rekordbox.exe]: rekordbox`, "Match title, otherwise find window of same type"), on track 1 only. Desktop Audio is disabled: the collection has no `DesktopAudioDevice1` entry, which is how OBS saves a global device set to Disabled, because a muted Desktop Audio still captured and logged "audio is lagging". Mic/Aux stays in the collection but starts muted, so nothing else mixes into the set.

The main OBS Replay Buffer is on, 20 s and 512 MB (`RecRB=true`, `RecRBTime=20`, `RecRBSize=512` in `[SimpleOutput]` and `[AdvOut]` of the common `basic.ini`, asserted by `tests/test_obs_secrets.mjs`), because the Aitum Vertical backtrack depends on it: without it the plugin logs "Can't start backtrack when no replay buffer is found". The installer only turns `RecRB` on; the length and size you set in OBS are kept.

Start the outputs one at a time. With the stream, auto-recording, the Replay Buffer and the backtrack all starting within the same ~300 ms, OBS 32.2.2 crashed on its video thread (exception `c0000005` in `default_raw_video_callback`, `obs.dll`). Untick Settings > Advanced > Recording > "Automatically record when streaming", then start the Replay Buffer, wait a few seconds, start streaming, and start recording last.

Vertical: the Aitum Vertical canvas is 1080x1920, and its "Vertical Scene" shows the same Browser source as the main scene (a reference, not a second browser), rotated 90 degrees to fill it. The Instagram output is 720x1280, 3000 kbps CBR, 2 s keyframe, audio 256 kbps (NVENC adds tune hq and two-pass quarter res). Backtrack keeps the last 90 s; the save hotkey is `OBS_KEY_PLUS` (the `}` key on a LatAm keyboard), and clips go to `-ReelDir`.

1. Install the Aitum Vertical plugin first, then close OBS. From PowerShell, in the repo:

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File obs\install.ps1 [-Variant nvidia|intel] [-ReelDir <folder>]
   ```

   It refuses while OBS runs, copies `%APPDATA%\obs-studio` to `obs-studio.backup-<timestamp>` beside it, picks `nvidia` when `Win32_VideoController` lists an NVIDIA GPU and `intel` otherwise (`-Variant` overrides), installs both profiles and the collection, makes the collection active in `user.ini` (and `stream-light` the active profile unless a `stream-light` profile already is), adds the Stream Health dock (see below), and turns off Browser Source hardware acceleration in `global.ini` (see "Running it as an OBS Browser Source"). It merges the vertical settings into `%APPDATA%\obs-studio\plugin_config\vertical-canvas\config.json`, finding the Instagram output by name and keeping its server, key and every field the template does not set; `-ReelDir` (default `%USERPROFILE%\Videos\reel-raw`) is the backtrack folder, created when missing. Reinstalling merges: the script sets only the keys and objects it owns (listed in `$ManagedProfileKeys` and the merge functions of `obs\ObsMerge.psm1`, plus the variant's `basic-overrides.ini` keys) and leaves the rest of each file as OBS wrote it; `tests/test_obs_merge.mjs` runs that merge on a fixture profile with fake tokens. A profile the script creates (for example `stream-light-hq` on its first install) starts from the template and takes `[Auth]`, `[YouTube]`, `[YouTube - *]` and `service.json` from another installed `stream-light` profile that is signed in; they are copied between installed profiles only, never into the repo. That new profile gets its own `[Panels] CookieId` from OBS, so its YouTube chat dock may ask for a Google sign-in once.

   What the installer never touches, in a profile that already exists:

   - the YouTube sign-in: `[YouTube]` (`RefreshToken`, `Token`, `ExpireTime`, `ScopeVer`, `ChannelName` and the stream setup fields), `[Auth]` and the per-service dock layout in `[YouTube - RTMP]` / `[YouTube - RTMPS]`, all in the profile's `basic.ini` (where OBS 32 keeps them);
   - `service.json` (service, server and stream key);
   - `[Panels] CookieId`, which names the browser docks' cookie folder under `plugin_config\obs-browser\obs_profile_cookies`;
   - Replay Buffer length and size (`RecRBTime`, `RecRBSize`), recording paths (`RecFilePath`, `FFFilePath`, `FilePath`), `[Hotkeys]` and every key outside the managed list;
   - fields of `streamEncoder.json` / `recordEncoder.json` the variant does not set;
   - in the collection, sources and scenes the repo does not have, items you added to the repo's scenes, source hotkeys, transitions and the other top-level settings;
   - the `user.ini` dock layout (`DockState` is written only when the Stream Health dock is new) and the active profile when it is already a `stream-light` one;
   - the Instagram server and key in the Aitum Vertical config.
2. Paste the stream keys in the app, never in a file of this repo: Settings > Stream, service YouTube - RTMPS, paste the YouTube key in "Stream Key" (or connect the account). For Instagram, paste its server URL and key in the Aitum Vertical output settings (Docks > Aitum Vertical). The script creates `service.json` only when it does not exist, so a key already saved survives a reinstall.
3. Set what the files cannot carry: the obs-websocket password (Tools > WebSocket Server Settings) and, in the Stream Health dock, Connection settings with that password. The recording folder is not set; choose it in Settings > Output.

Launch, in two PowerShell windows (paths are this repo's and the default OBS install; adjust them on the other PC):

```
python C:\Users\jorge\Workspace\personal\stream-light-app\serve.py
Start-Process "C:\Program Files\obs-studio\bin\64bit\obs64.exe" -ArgumentList '--enable-media-stream','--profile','stream-light','--collection','stream-light-scenes' -WorkingDirectory "C:\Program Files\obs-studio\bin\64bit"
```

`serve.py` serves its own folder whatever the current directory is, and it runs without `--chrome` because this collection hosts the page in the Browser Source.

`obs/profile/stream-light/service.example.json` is the stream service with an empty `key`. OBS writes the real `service.json` beside it once a key is saved; `.gitignore` excludes `obs/profile/*/service.json`, so the key cannot be committed by accident. The same goes for the account tokens OBS puts in `basic.ini` after you sign in: commit the profile only after removing the `[YouTube]` section. `tests/test_obs_secrets.mjs` fails when any file under `obs/` holds a stream key or server field, or a YouTube section with anything but `DockState`.

### Stream health monitor dock

`monitor/` is a separate page that runs as an OBS custom dock: Docks > Custom Browser Docks, URL `http://localhost:8080/monitor/?v=<BUILD>`, with the obs-websocket server enabled on port 4455 and a password. `monitor/README.md` gives the current `<BUILD>` value, the steps and what the dock shows.

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
tests/test_obs_merge.mjs runs the installer's merge on tests/fixtures/obs/ (fake tokens) and checks what it keeps and updates
```

## Ownership

Personal project of Jorge Aguilar. No license granted.
