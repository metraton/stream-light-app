// --- Color Controls (Color Hex) ---
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

/**
 * Builds one picker per color.
 * @param {Function} onColorsChange called after a hex changes, so every panel swatch redraws.
 * @returns {Function} refresh: shows CONFIG.colors in the pickers.
 */
export function createColorControls(sectionEl, app, onColorsChange) {
    const rows = CONFIG.colorOrder.map(name => {
        const row = document.createElement('div');
        row.className = 'color-row';

        const label = document.createElement('label');
        label.textContent = name;

        const picker = document.createElement('input');
        picker.type = 'color';

        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'hex-value';

        picker.addEventListener('input', () => {
            CONFIG.colors[name] = intFromHex(picker.value);
            app.reapplyColors();
            onColorsChange();
        });

        row.appendChild(label);
        row.appendChild(picker);
        row.appendChild(hexDisplay);
        sectionEl.appendChild(row);
        return { name, picker, hexDisplay };
    });

    function refresh() {
        for (const { name, picker, hexDisplay } of rows) {
            picker.value = colorHex(name);
            hexDisplay.textContent = picker.value;
        }
    }

    refresh();
    return refresh;
}
