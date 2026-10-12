// --- Color Controls ---
import { CONFIG } from '../config.js';

function hexFromInt(val) {
    return '#' + val.toString(16).padStart(6, '0');
}

/** The CSS hex of color `name` (a CONFIG.colorOrder entry) as it is now. */
export function colorHex(name) {
    return hexFromInt(CONFIG.colors[name]);
}

function intFromHex(hex) {
    return parseInt(hex.slice(1), 16);
}

export function createColorControls(sectionEl, app) {
    for (const name of CONFIG.colorOrder) {
        const row = document.createElement('div');
        row.className = 'color-row';

        const label = document.createElement('label');
        label.textContent = name;

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = hexFromInt(CONFIG.colors[name]);

        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'hex-value';
        hexDisplay.textContent = picker.value;

        picker.addEventListener('input', () => {
            CONFIG.colors[name] = intFromHex(picker.value);
            hexDisplay.textContent = picker.value;
            // Re-render from the sequencer's current frame so the new hex is
            // picked up for whatever colors are live (was refreshColors()).
            app.reapplyColors();
        });

        row.appendChild(label);
        row.appendChild(picker);
        row.appendChild(hexDisplay);
        sectionEl.appendChild(row);
    }
}
