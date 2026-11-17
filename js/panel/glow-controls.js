// --- Glow section: the glow playing now, its controls, and the GlowFilter look ---
// Built like Movimiento: the active glow, its triggers, the shared intensity
// and Stop controls, then the look (color, and an Avanzado fold).
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

/** The Avanzado sliders over CONFIG.glow; their ranges also bound what a preset may load.
 *  Distance and Quality rebuild the filters, so they move in whole useful steps. */
export const GLOW_LOOK_DEFS = [
    { key: 'outerStrength', label: 'Strength', min: 0, max: 4, decimals: 1, rebuild: false },
    { key: 'distance', label: 'Distance', min: 4, max: 16, decimals: 0, rebuild: true },
    { key: 'quality', label: 'Quality', min: 0.1, max: 0.5, decimals: 2, rebuild: true, step: 0.05 },
];

/** Stored glow fields with each finite slider value clamped to its range; other fields pass as they are. */
export function clampGlowLook(glow) {
    const clamped = { ...glow };
    for (const { key, min, max } of GLOW_LOOK_DEFS) {
        if (Number.isFinite(clamped[key])) clamped[key] = Math.min(max, Math.max(min, clamped[key]));
    }
    return clamped;
}

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
    customColor.className = 'color-input';
    customColor.title = 'Custom';
    customColor.value = '#' + g.customColor.toString(16).padStart(6, '0');
    customColor.addEventListener('input', () => {
        g.customColor = parseInt(customColor.value.slice(1), 16);
        cm.updateGlowColors();
    });
    colorBtns[0].parentElement.appendChild(customColor);

    const advanced = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'subhead';
    summary.textContent = 'Avanzado';
    advanced.appendChild(summary);
    sectionEl.appendChild(advanced);

    for (const { key, label, min, max, decimals, rebuild, step } of GLOW_LOOK_DEFS) {
        createSlider(advanced, {
            label, min, max, decimals, step,
            defaultValue: DEFAULTS.glow[key], value: g[key],
            onChange: v => {
                g[key] = v;
                if (rebuild) {
                    cm.rebuild();
                    app.reapplyColors();
                } else {
                    cm.updateGlowParams();
                }
            },
        });
    }

    function refreshColor() {
        markChoice(colorBtns, i => COLOR_MODES[i].value === g.colorMode);
        customColor.hidden = g.colorMode !== 'custom';
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
