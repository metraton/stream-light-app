// --- Live bridge: keys from any window, relayed by serve.py ---
// serve.py owns the global keyboard hook; live mode follows Caps Lock. This
// module tells it which keystrokes the app binds (resolveShortcut decides, so
// the key map stays in js/shortcuts.js), runs the keystrokes it relays, and
// shows the EN VIVO badge while live mode is on.

import { resolveShortcut } from './shortcuts.js';

/** Connects the page to serve.py's /events stream; under any other server the stream just keeps retrying. */
export function connectLiveBridge(app) {
    const badge = document.createElement('div');
    badge.id = 'live-badge';
    badge.textContent = 'EN VIVO';
    badge.hidden = true;
    document.body.append(badge);

    const events = new EventSource('/events');

    events.addEventListener('live', (message) => {
        badge.hidden = !JSON.parse(message.data).live;
    });

    events.addEventListener('candidates', (message) => {
        const bound = JSON.parse(message.data)
            .filter((keystroke) => resolveShortcut(keystroke) !== null)
            .map((keystroke) => keystroke.id);
        fetch('/bound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bound),
        });
    });

    events.addEventListener('key', (message) => {
        const action = resolveShortcut(JSON.parse(message.data));
        if (action) action(app);
    });

    // A dropped connection means the hook can no longer relay anything, so the
    // badge must not keep claiming live mode.
    events.addEventListener('error', () => {
        badge.hidden = true;
    });
}
