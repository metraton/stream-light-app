# Stream health monitor

A dock page that shows, at a glance, whether each OBS destination is really live: the main stream and every Aitum Vertical output. It reads obs-websocket v5 locally, so it uses no bandwidth and never opens the platform pages.

## What it is and why it exists

OBS reports an output as active even when the platform has stopped accepting data. The monitor polls once per second and judges each output from its byte counter, not from the active flag alone: an output that is active but whose bytes have not increased for 5 seconds is shown as down (stalled). The event log records every state change with a reason (`stalled`, `reconnecting`, `inactive`, `congestion`, `skipped-frames`), so after a session a `reconnecting` entry points at the network and a `stalled` or `inactive` entry on one destination while the others stay live points at the platform side.

## Flow

```
page loads -> ws://host:port -> Hello -> Identify (SHA-256 auth string) -> Identified
every 1 s, one request at a time (poller.js):
  GetStreamStatus                 -> main stream snapshot
  CallVendorRequest status        -> Aitum says whether its canvas is streaming
  GetOutputStatus                 -> only while Aitum says streaming: vertical_canvas_stream_<name> snapshot
after a failed or timed-out request: silence for 2 s, doubling up to 30 s
snapshots -> classify() in health.js -> live | degraded | reconnecting | down
state change -> log line; entering reconnecting/down -> red banner + alarm; leaving -> green banner + chime
Restart output -> CallVendorRequest aitum-vertical-canvas stop_streaming, then start_streaming once the output reports inactive
```

## Requirements

- OBS 28 or later with the obs-websocket server enabled (Tools > WebSocket Server Settings), default port 4455.
- The page must be served over HTTP, because it is made of ES modules: `python serve.py` from the repository root (then it is at `http://localhost:8080/monitor/`), or `python -m http.server 8081` inside this folder. Opening the file directly (`file://`) does not work.
- The restart button needs the Aitum Vertical plugin; without it the button is hidden.

## How it is used

1. In OBS: Docks > Custom Browser Docks, name `Stream Health`, URL `http://localhost:8080/monitor/`, Apply.
2. In the dock, open Connection settings, enter the obs-websocket password and press Connect. Host, port and password are kept in the browser's local storage (the password in clear text).
3. Click once in the dock, or press Connect, so the browser allows sound; Test sound plays both tones.

URL parameters: `host`, `port`, `output` (the Aitum output name, default `IG`; override the saved values) and `stall` (seconds without new bytes before an active output counts as down, default 5). Example: `http://localhost:8080/monitor/?port=4456&stall=8`.

Thresholds for degraded (congestion 0.3 and above, or 2% skipped frames over the last 5 seconds) are `DEFAULTS` in `health.js`.

## Structure

```
monitor/index.html   the dock page: settings, cards, banner, sound, event log, restart action
monitor/health.js    pure logic: classify() snapshots into a state, transitionKind() for alerts
monitor/obs-auth.js  pure logic: obs-websocket v5 authentication string
monitor/poller.js    which requests are sent, one at a time, with back-off; the only place requests are chosen
tests/test_stream_health.mjs   tests for health.js and obs-auth.js
tests/test_poller.mjs          tests that the poller never sends GetOutputList and gates GetOutputStatus on Aitum
```

## Conventions

The vertical output is addressed as `vertical_canvas_stream_<output name>`, the name Aitum Vertical gives its stream outputs. `GetOutputList` must never be added to the poller: in obs-websocket 5.6.x it calls `obs_output_get_width` on every output, which crashed OBS on an output without video. The `outputSkippedFrames` field is, in obs-websocket 5.6.x, libobs `obs_output_get_frames_dropped`, so the skipped rate shown is the output's dropped-frame rate.
