// --- Glow Controls: the GlowFilter look ---
// The glow sequence playing now, its rate and its easing are set in
// "Sonando ahora" (layer-controls.js).
import { CONFIG } from '../config.js';
import { GLOW_QUICK } from '../glow-map.js';
import { createSlider } from './slider.js';
import { buttonRow } from './layer-controls.js';

// The look the app starts with, which a double click on a slider returns to.
const GLOW_DEFAULTS = Object.freeze({ ...CONFIG.glow });

export function createGlowControls(sectionEl, app) {
    const g = CONFIG.glow;
    const cm = app.columnManager;

    // === Trigger: the glows of the key grid (glow-map.js), one button each ===
    const triggerHeader = document.createElement('div');
    triggerHeader.className = 'effect-name';
    triggerHeader.textContent = 'Glow (Z X C V B N)';
    sectionEl.appendChild(triggerHeader);
    buttonRow(sectionEl, GLOW_QUICK.map(({ key, label }) => `${key.toUpperCase()} ${label}`), i => {
        app.setGlowMode(GLOW_QUICK[i].mode);
        app.updateHUD();
    });

    // === Parameters ===
    const paramHeader = document.createElement('div');
    paramHeader.className = 'effect-name';
    paramHeader.textContent = 'Parameters';
    sectionEl.appendChild(paramHeader);

    // Ranges keep the values that change the look visibly; Distance and
    // Quality rebuild the filters, so they move in whole useful steps.
    createSlider(sectionEl, {
        label: 'Strength', min: 0, max: 6, decimals: 1,
        defaultValue: GLOW_DEFAULTS.outerStrength, value: g.outerStrength,
        onChange: v => {
            g.outerStrength = v;
            cm.updateGlowParams();
        },
    });

    createSlider(sectionEl, {
        label: 'Distance', min: 4, max: 20, decimals: 0,
        defaultValue: GLOW_DEFAULTS.distance, value: g.distance,
        onChange: v => {
            g.distance = v;
            cm.rebuild();
            app.reapplyColors();
        },
    });

    createSlider(sectionEl, {
        label: 'Quality', min: 0.1, max: 0.5, decimals: 2,
        defaultValue: GLOW_DEFAULTS.quality, value: g.quality,
        onChange: v => {
            g.quality = v;
            cm.rebuild();
            app.reapplyColors();
        },
    });

    // --- Color Mode ---
    const colorRow = document.createElement('div');
    colorRow.className = 'effect-row';

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color';

    const colorSelect = document.createElement('select');
    const modes = [
        { value: 'column', label: 'Column' },
        { value: 'white', label: 'White' },
        { value: 'custom', label: 'Custom' },
    ];
    for (const m of modes) {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        if (m.value === g.colorMode) opt.selected = true;
        colorSelect.appendChild(opt);
    }

    const customColorInput = document.createElement('input');
    customColorInput.type = 'color';
    customColorInput.value = '#' + g.customColor.toString(16).padStart(6, '0');
    customColorInput.style.display = g.colorMode === 'custom' ? 'inline-block' : 'none';
    customColorInput.style.width = '30px';
    customColorInput.style.marginLeft = '6px';

    colorSelect.addEventListener('change', () => {
        g.colorMode = colorSelect.value;
        customColorInput.style.display = g.colorMode === 'custom' ? 'inline-block' : 'none';
        cm.updateGlowColors();
    });
    customColorInput.addEventListener('input', () => {
        g.customColor = parseInt(customColorInput.value.slice(1), 16);
        cm.updateGlowColors();
    });

    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorSelect);
    colorRow.appendChild(customColorInput);
    sectionEl.appendChild(colorRow);
}
