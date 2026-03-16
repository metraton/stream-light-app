// --- Entry Point ---
import { StreamLightApp } from './app.js';
import { populateCameraSelect } from './camera.js';

let app = null;

window.startApp = async function () {
    const select = document.getElementById('camera-select');
    const deviceId = select.value;
    const errorDiv = document.getElementById('startup-error');

    if (!deviceId) {
        errorDiv.textContent = 'Please select a camera';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        app = new StreamLightApp();
        await app.init(deviceId);
        window._app = app;
        document.getElementById('startup').classList.add('hidden');
    } catch (e) {
        console.error('Failed to start:', e);
        errorDiv.textContent = `Error: ${e.message}`;
        errorDiv.style.display = 'block';
    }
};

window.startDemo = async function () {
    try {
        app = new StreamLightApp();
        await app.initDemo();
        window._app = app;
        document.getElementById('startup').classList.add('hidden');
    } catch (e) {
        console.error('Failed to start demo:', e);
    }
};

populateCameraSelect();
