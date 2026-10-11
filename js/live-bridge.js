// --- Live bridge: keys from any window, relayed by serve.py ---
// serve.py owns the global keyboard hook; live mode follows Caps Lock. This
// module tells it which keystrokes the app binds (resolveShortcut decides, so
// the key map stays in js/shortcuts.js), runs the keystrokes it relays, and
// shows the live state in the window title only: OBS Window Capture records
// the page content, so nothing about live mode may be drawn inside the page.
// Every bridge event is logged to the console with a [live-bridge] prefix.

import { resolveShortcut } from './shortcuts.js';

const TITLES = {
    idle: 'Stream Light',
    live: 'Stream Light — EN VIVO',
    disconnected: 'Stream Light — sin conexión',
};

/** Connects the page to serve.py's /events stream; under any other server the stream just keeps retrying. */
export function connectLiveBridge(app) {
    const events = new EventSource('/events');
    console.info('[live-bridge] connecting to /events');

    events.addEventListener('open', () => {
        console.info('[live-bridge] /events connected');
    });

    events.addEventListener('live', (message) => {
        const { live } = JSON.parse(message.data);
        console.info(`[live-bridge] live=${live}`);
        document.title = live ? TITLES.live : TITLES.idle;
    });

    events.addEventListener('candidates', (message) => {
        const bound = JSON.parse(message.data)
            .filter((keystroke) => resolveShortcut(keystroke) !== null)
            .map((keystroke) => keystroke.id);
        fetch('/bound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bound),
        }).then(
            (response) => console.info(`[live-bridge] POST /bound ${bound.length} keystrokes -> ${response.status}`),
            (error) => console.warn('[live-bridge] POST /bound failed', error),
        );
    });

    events.addEventListener('key', (message) => {
        const keystroke = JSON.parse(message.data);
        const action = resolveShortcut(keystroke);
        console.info(`[live-bridge] relayed ${keystroke.id} -> ${action ? 'run' : 'unbound'}`);
        if (action) action(app);
    });

    // Without the connection the hook can relay nothing, so the title must not
    // keep claiming live mode; the next 'live' event after reconnecting restores it.
    events.addEventListener('error', () => {
        console.warn('[live-bridge] /events disconnected; the browser retries automatically');
        document.title = TITLES.disconnected;
    });
}
