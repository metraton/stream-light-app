# Stream Light

A webcam light show for streaming: colored columns, movements and glows driven from the keyboard, captured by OBS.

## What it is and why it exists

Stream Light is a browser page (PixiJS) that slices the webcam image into colored columns and animates them. Every control is a keyboard shortcut, so the streamer plays it like an instrument. The page runs in a dedicated Chrome app window that OBS captures as a source.

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
- Google Chrome, for the `--chrome` option.
- Node.js 22 or later, only to run the pattern tests.

## How it is used

```
python serve.py --chrome
```

This serves the app at `http://localhost:8080` (bound to `127.0.0.1` only), installs the hook, and opens the Chrome app window with the profile and background-throttling flags OBS capture needs. Drop `--chrome` to open the window yourself; `--port` changes the port; `--debug` logs every bridge event. Ctrl+C stops it. Expected first line (live mode starts already on if Caps Lock is on):

```
Serving C:\...\stream-light-app at http://localhost:8080 (bound to 127.0.0.1). Caps Lock toggles live mode (now OFF); Ctrl+C stops.
```

Press START or DEMO in the page first: the page reports its bound keys once the app is running, and until then live mode swallows nothing.

Every row of the key grid has six keys and starts with None:

| Keys | Row | Key 1 to 6 |
|------|-----|------------|
| `\|` `1`-`5` `6` | Colors (Shift selects only that one; `6` and `Shift+6` are the same) | Empty, Yellow, Blue, Red, Green, Purple, Todos al azar (all 5 in a new random order each press; pattern and other layers untouched) |
| `Q W E R T Y` | Pattern (Shift plays its variant, shown as ⇄) | None, Chase, Carousel, Mirror, Fill, Sparkle |
| `A S D F G H` | Movement | None, Wave, Expand, Broken, Shake, Equalizer |
| `Z X C V B N` | Glow | None, Sweep, Breathe, Pulse, Strobe, Alternate |
| `Shift+Z X C V B N` | Mood (`<` is also None) | None, Calm, Build, Tension, Peak, Mystic |
| `Backspace` / `Space` | Cue | stage a new combo while the live one plays / commit it (otherwise pause / resume) |
| `Escape` | Base state | no colors, every layer None, 120 BPM, playing (the first color pressed moves at once); layout, filters, rotation and FPS cap stay |
| `+` / `´`, `0`, `J`, `P` | Other | BPM up/down, next camera, HUD, panel |
| `9` | Text | fade the text overlay in or out (250 ms); Shift+9 stays unbound |

The text overlay (`9`, or the panel's Texto section) draws the current phrase as hollow Fredoka letters outlined by a thin double line, with a glow and an optional dark band across the frame. It sits above the Pantalla layer, so screen effects never distort it. The panel sets the phrase, saved phrases (seeded with FLASH LIGHT and CANDLE LIGHT, kept in localStorage apart from presets), color (Neón, Columna = first selected color, Blanco, Custom), size, band and its opacity, position (Centro / Arriba / Abajo) and beat behavior (Fijo, Pulso al golpe, Parpadeo neón). Presets save that look as `text` but never whether it shows; a preset from before carries none and loads the defaults.

Pattern variants (`js/color-sequencer.js` `PATTERN_VARIANTS`): Carousel reversed runs the same frames backwards. Chase, Mirror, Fill and Sparkle negative swap lit and Empty columns: each selected color in turn fills the row and the columns the normal pattern lights for that color alone become gaps, so Chase is a full row with a travelling gap and Fill empties the row column by column. None has no variant, so Shift+Q is Q. A plain key always picks the normal pattern; pressing Shift again keeps the variant; moods play the normal pattern.

The base state and the moods are defined once, in `js/mood-map.js`.

Live state is shown only in the window title, never inside the page, because OBS Window Capture records the page content and not the title bar: `Stream Light — EN VIVO` while live, `Stream Light` when not, and `Stream Light — sin conexión` while the page has lost its connection to `serve.py`. The title is visible on the taskbar and in Alt+Tab.

Ctrl and Alt combinations are never relayed, so Ctrl+Backspace and similar keep working in other programs while live.

The panel's Color section adjusts the image like a color-grading panel: the "Todos" chip sets one global brightness, contrast, saturation, hue and temperature for every column, uncolored ones included, and each color chip adds an offset for the columns showing that color (effective value = global + offset, clamped to the slider range). A dot marks a color with an offset; Shift+click edits several colors at once; double click clears a color's offset (on "Todos", resets the global value). Offsets belong to the color slot, not the hex value. Presets saved before this model stored absolute per-color values; on load, `migrateLegacyFilters` in `js/color-filter.js` makes the global value neutral and each color's offset its old value minus neutral, so a loaded preset looks the same as before.

Tests (the file server, the bridge and the Caps Lock logic, without installing the hook): `python -m unittest discover -s tests -v`. Pattern, key-grid and syntax tests, without a browser: `node --test tests/test_patterns.mjs`. Color panel math: `node --test tests/test_color_filter.mjs`.

## Structure

```
index.html          page shell, HUD styles and the on-screen key help
panel.css           control panel styles
serve.py            file server + keyboard hook (Caps Lock live mode) + /events and /bound bridge, one process
js/main.js          entry point: camera picker, START / DEMO
js/app.js           StreamLightApp: wires engines, HUD, panel, shortcuts and the live bridge
js/shortcuts.js     resolveShortcut, the single key map, and the keydown listener
js/live-bridge.js   page side of live mode: reports bound keys, runs relayed keys, sets the window title
js/glow-map.js      glow quick keys shared by shortcuts and the panel
js/mood-map.js      the base state and the moods, shared by the app, shortcuts and the panel
js/color-filter.js  Color panel model: global filter + per-color offsets, effective values, old-preset migration
js/overlay-text.js  text overlay model: settings and their preset restore, saved phrases, fade, beat pulse, seeded flicker
js/overlay.js       text overlay rendering: double-outline phrase, glow and band above the screen layer
js/panel/           control panel sections
js/*.js             rendering engines: columns, effects, glow, color sequencer, camera, HUD
tests/test_serve.py    tests for the file server, the bridge and the Caps Lock live-mode logic
tests/test_patterns.mjs tests for the color patterns, the key grid and JS syntax
tests/test_color_filter.mjs tests for the Color panel math and the old-preset migration
tests/test_text_overlay.mjs tests for the text overlay's phrases, preset restore, fade, flicker and key 9
```

## Ownership

Personal project of Jorge Aguilar. No license granted.
