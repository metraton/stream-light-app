// --- Glow section: the glow playing now, its controls, and the GlowFilter look ---
// Built like Movimiento: the active glow, its triggers, the shared intensity,
// easing, rate and Stop controls, then the look (color, and an Avanzado fold).
import { CONFIG, DEFAULTS } from '../config.js';
import { GLOW_QUICK } from '../glow-map.js';
import { createSlider } from './slider.js';
import { activeLine, buttonRow } from './layer-controls.js';
import { createLayerTweaks, markChoice } from './effect-controls.js';

const COLOR_MODES = [
    { value: 'column', label: 'Column' },
    { value: 'white',  label: 'White' },
    { value: 'custom', label: 'Custom' },
];

/** Builds the Glow section; returns its refresh callback. */
export function createGlowControls(sectionEl, app) {
    const g = CONFIG.glow;
    const cm = app.columnManager;

    const setName = activeLine(sectionEl, 'Glow');
    const triggerBtns = buttonRow(sectionEl, GLOW_QUICK.map(({ key, label }) => `${key.toUpperCase()} ${label}`), i => {
        app.setGlowMode(GLOW_QUICK[i].mode);
        app.refreshPanel();
    });
    const refreshTweaks = createLayerTweaks(sectionEl, app, 'glow', () => {
        app.setGlowMode('none');
        app.refreshPanel();
    });

    const colorBtns = buttonRow(sectionEl, COLOR_MODES.map(m => m.label), i => {
        g.colorMode = COLOR_MODES[i].value;
        cm.updateGlowColors();
        refreshColor();
    });
    const customColor = document.createElement('input');
    customColor.type = 'color';
    customColor.title = 'Custom';
    customColor.value = '#' + g.customColor.toString(16).padStart(6, '0');
    customColor.style.width = '30px';
    customColor.addEventListener('input', () => {
        g.customColor = parseInt(customColor.value.slice(1), 16);
        cm.updateGlowColors();
    });
    colorBtns[0].parentElement.appendChild(customColor);

    // Distance and Quality rebuild the filters, so they move in whole useful steps.
    const advanced = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'effect-name';
    summary.textContent = 'Avanzado';
    advanced.appendChild(summary);
    sectionEl.appendChild(advanced);

    createSlider(advanced, {
        label: 'Strength', min: 0, max: 6, decimals: 1,
        defaultValue: DEFAULTS.glow.outerStrength, value: g.outerStrength,
        onChange: v => {
            g.outerStrength = v;
            cm.updateGlowParams();
        },
    });
    createSlider(advanced, {
        label: 'Distance', min: 4, max: 20, decimals: 0,
        defaultValue: DEFAULTS.glow.distance, value: g.distance,
        onChange: v => {
            g.distance = v;
            cm.rebuild();
            app.reapplyColors();
        },
    });
    createSlider(advanced, {
        label: 'Quality', min: 0.1, max: 0.5, decimals: 2,
        defaultValue: DEFAULTS.glow.quality, value: g.quality,
        onChange: v => {
            g.quality = v;
            cm.rebuild();
            app.reapplyColors();
        },
    });

    function refreshColor() {
        markChoice(colorBtns, i => COLOR_MODES[i].value === g.colorMode);
        customColor.style.display = g.colorMode === 'custom' ? '' : 'none';
    }

    function refresh() {
        setName(app.nowPlaying().glow.label);
        markChoice(triggerBtns, i => app.currentGlowMode === GLOW_QUICK[i].mode);
        refreshTweaks();
        refreshColor();
    }

    refresh();
    return refresh;
}
