// --- Cámaras section: which cameras key 0 rotates through, and in what order ---
import { orderedCameras } from '../camera-rotation.js';

/**
 * Lists the plugged-in cameras in rotation order, each with an on/off checkbox and up/down buttons;
 * ● marks the camera on stage. Returns the refresh function the app calls after any camera change.
 */
export function createCameraControls(sectionEl, app) {
    const list = document.createElement('div');
    sectionEl.appendChild(list);

    const button = (text, title, disabled, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.title = title;
        btn.disabled = disabled;
        btn.addEventListener('click', onClick);
        return btn;
    };

    const refresh = () => {
        const cameras = orderedCameras(app.cameraOrder, app.cameras);
        if (cameras.length === 0) {
            const empty = document.createElement('label');
            empty.textContent = 'No cameras';
            list.replaceChildren(empty);
            return;
        }
        list.replaceChildren(...cameras.map((cam, i) => {
            const row = document.createElement('div');
            row.className = 'preset-row camera-row';

            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.checked = cam.enabled;
            enabled.title = 'En la rotación de la tecla 0';
            enabled.addEventListener('change', () => app.setCameraEnabled(cam.key, enabled.checked));

            const name = document.createElement('span');
            name.className = 'camera-name';
            name.textContent = `${cam.key === app.activeCameraKey ? '● ' : ''}${cam.key}`;
            name.title = cam.key;

            row.append(
                enabled,
                name,
                button('↑', 'Antes en la rotación', i === 0, () => app.moveCamera(cam.key, -1)),
                button('↓', 'Después en la rotación', i === cameras.length - 1, () => app.moveCamera(cam.key, 1)),
            );
            return row;
        }));
    };

    refresh();
    return refresh;
}
