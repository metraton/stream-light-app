// --- Live bridge: keys from any window, relayed by serve.py ---
// serve.py owns the global keyboard hook; live mode follows Caps Lock. This
// module tells it which keystrokes the app binds (resolveShortcut decides, so
// the key map stays in js/shortcuts.js), runs the keystrokes it relays, and
// shows the EN VIVO badge while live mode is on. Every bridge event is logged
// to the console with a [live-bridge] prefix for diagnosis.

import { resolveShortcut } from './shortcuts.js';

/** Connects the page to serve.py's /events stream; under any other server the stream just keeps retrying. */
export function connectLiveBridge(app) {
    const badge = document.createElement('div');
    badge.id = 'live-badge';
    badge.textContent = 'EN VIVO';
    badge.hidden = true;
    document.body.append(badge);

    const events = new EventSource('/events');
    console.info('[live-bridge] connecting to /events');

    events.addEventListener('open', () => {
        console.info('[live-bridge] /events connected');
    });

    events.addEventListener('live', (message) => {
        const { live } = JSON.parse(message.data);
        console.info(`[live-bridge] live=${live}`);
        badge.hidden = !live;
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

    // A dropped connection means the hook can no longer relay anything, so the
    // badge must not keep claiming live mode.
    events.addEventListener('error', () => {
        console.warn('[live-bridge] /events disconnected; the browser retries automatically');
        badge.hidden = true;
    });
}
