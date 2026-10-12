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
| `\|` `1`-`5` `6` | Colors (Shift selects only that one) | Empty, Yellow, Blue, Red, Green, Purple, Rainbow |
| `Q W E R T Y` | Pattern | None, Chase, Carousel, Mirror, Sparkle, Fill |
| `A S D F G H` | Movement | None, Wave, Expand, Broken, Shake, Equalizer |
| `Z X C V B N` | Glow | None, Sweep, Breathe, Pulse, Strobe, Alternate |
| `Shift+Z X C V B N` | Mood (`<` is also None) | None, Calm, Build, Tension, Peak, Mystic |
| `Backspace` / `Space` | Cue | stage a new combo while the live one plays / commit it (or play-stop) |
| `Escape` | Base state | no colors, every layer None, 120 BPM, stopped; layout, filters, rotation and FPS cap stay |
| `+` / `´`, `0`, `J`, `P` | Other | BPM up/down, next camera, HUD, panel |

The base state and the moods are defined once, in `js/mood-map.js`.

Live state is shown only in the window title, never inside the page, because OBS Window Capture records the page content and not the title bar: `Stream Light — EN VIVO` while live, `Stream Light` when not, and `Stream Light — sin conexión` while the page has lost its connection to `serve.py`. The title is visible on the taskbar and in Alt+Tab.

Ctrl and Alt combinations are never relayed, so Ctrl+Backspace and similar keep working in other programs while live.

Tests (the file server, the bridge and the Caps Lock logic, without installing the hook): `python -m unittest discover -s tests -v`. Pattern, key-grid and syntax tests, without a browser: `node --test tests/test_patterns.mjs`.

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
js/panel/           control panel sections
js/*.js             rendering engines: columns, effects, glow, color sequencer, camera, HUD
tests/test_serve.py    tests for the file server, the bridge and the Caps Lock live-mode logic
tests/test_patterns.mjs tests for the color patterns, the key grid and JS syntax
```

## Ownership

Personal project of Jorge Aguilar. No license granted.
