// --- Movimiento section, and the active-effect controls it shares with Glow ---
// Intensity, easing and rate act on the effect a layer plays now
// (app.nowPlaying) and are remembered for it by the app; nothing here writes
// to the effect definitions.
import { RATES, RATE_LABELS } from '../tempo.js';
import { EFFECTS } from '../effects.js';
import { createSlider } from './slider.js';
import { EASING_MODES, activeLine, buttonRow, sameCurve } from './layer-controls.js';

/** Bounds of the intensity slider; app.js importTweaks drops a stored intensity outside them. */
export const INTENSITY_MIN = 0.25;
export const INTENSITY_MAX = 2;

/** Highlight the button isOn picks; an idle row is disabled and nothing is picked. */
export function markChoice(btns, isOn, idle = false) {
    btns.forEach((btn, i) => {
        const on = !idle && isOn(i);
        btn.disabled = idle;
        btn.style.background = on ? '#FFD700' : '#333';
        btn.style.color = on ? '#000' : (idle ? '#555' : '#aaa');
    });
}

/**
 * Intensity slider, easing and rate buttons and Stop for what `layer`
 * ('movement' or 'glow') plays now. Returns refresh(), which follows app.nowPlaying().
 */
export function createLayerTweaks(parent, app, layer, onStop) {
    const intensity = createSlider(parent, {
        label: 'Intensidad', min: INTENSITY_MIN, max: INTENSITY_MAX, defaultValue: 1, decimals: 2,
        onChange: v => app.setLayerIntensity(layer, v),
    });
    const easingBtns = buttonRow(parent, EASING_MODES.map(m => m.label),
        i => app.setLayerEasing(layer, EASING_MODES[i].curve));
    const rateBtns = buttonRow(parent, RATES.map(r => RATE_LABELS.get(r)),
        i => app.setLayerRate(layer, RATES[i]));

    const buttons = document.createElement('div');
    buttons.className = 'effect-buttons';
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', onStop);
    buttons.appendChild(stopBtn);
    parent.appendChild(buttons);

    return function refresh() {
        const playing = app.nowPlaying()[layer];
        const idle = playing.rate === null;
        intensity.setDisabled(idle);
        intensity.show(playing.intensity ?? 1);
        markChoice(easingBtns, i => sameCurve(EASING_MODES[i].curve, playing.easing), idle);
        markChoice(rateBtns, i => RATES[i] === playing.rate, idle);
    };
}

/** Builds the Movimiento section; returns its refresh callback. */
export function createEffectControls(sectionEl, app) {
    const setName = activeLine(sectionEl, 'Movimiento');
    const refreshTweaks = createLayerTweaks(sectionEl, app, 'movement', () => app.stopEffect());
    // One row of option buttons per movement with def.options, shown while that movement plays.
    const optionRows = Object.entries(EFFECTS).filter(([, def]) => def.options).map(([name, { options }]) => {
        const btns = buttonRow(sectionEl, options.map(o => o.label), i => app.setMovementOption(options[i].value));
        return { name, options, btns, row: btns[0].parentElement };
    });

    function refresh() {
        const playing = app.nowPlaying().movement;
        setName(playing.label);
        refreshTweaks();
        for (const { name, options, btns, row } of optionRows) {
            const shown = app.currentMovement === name;
            row.style.display = shown ? '' : 'none';
            if (shown) markChoice(btns, i => options[i].value === playing.option);
        }
    }

    refresh();
    return refresh;
}
