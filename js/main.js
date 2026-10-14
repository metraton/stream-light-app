// --- Entry Point ---
import { StreamLightApp } from './app.js';

// Two pages would each open the camera and render it, doubling the GPU load,
// so only the page holding this Web Lock starts. The browser releases the lock
// when its page closes or crashes, so reloading a refused page takes over.
const INSTANCE_LOCK = 'stream-light-instance';

/** Replaces the whole page with a notice, so nothing here can start the camera, rendering or the bridge. */
function showAlreadyOpen() {
    const notice = document.createElement('p');
    notice.textContent = 'Stream Light ya está abierto en otra ventana. Ciérrala y recarga esta para usarla aquí.';
    notice.style.cssText = 'margin: 2em; font: 18px sans-serif; color: #ccc;';
    document.body.replaceChildren(notice);
    document.title = 'Stream Light — ya abierto en otra ventana';
}

navigator.locks.request(INSTANCE_LOCK, { ifAvailable: true }, (lock) => {
    if (lock === null) {
        console.warn('[instance] another Stream Light page holds the lock; this one stays idle');
        showAlreadyOpen();
        return undefined;
    }
    const app = new StreamLightApp();
    window._app = app;
    app.start().catch(e => console.error('Failed to start:', e));
    return new Promise(() => {});
});
