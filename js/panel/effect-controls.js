// --- Movimiento section: the movement playing now and its controls ---
// Intensity, easing and rate act on the active movement (app.nowPlaying) and
// are remembered for it by the app; nothing here writes to EFFECTS.
import { EFFECTS } from '../effects.js';
import { RATES, RATE_LABELS } from '../tempo.js';
import { createSlider } from './slider.js';
import { EASING_MODES, buttonRow, sameCurve } from './layer-controls.js';

/** Bounds of the movement intensity slider; app.js importTweaks drops a stored intensity outside them. */
export const INTENSITY_MIN = 0.25;
export const INTENSITY_MAX = 2;

/** Builds the section; returns its refresh callback. */
export function createEffectControls(sectionEl, app) {
    const row = document.createElement('div');
    row.className = 'effect-row';
    const label = document.createElement('label');
    label.textContent = 'Movimiento';
    const name = document.createElement('span');
    name.className = 'range-value';
    row.append(label, name);
    sectionEl.appendChild(row);

    const intensity = createSlider(sectionEl, {
        label: 'Intensidad', min: INTENSITY_MIN, max: INTENSITY_MAX, defaultValue: 1, decimals: 2,
        onChange: v => app.setMovementIntensity(v),
    });
    const easingBtns = buttonRow(sectionEl, EASING_MODES.map(m => m.label),
        i => app.setLayerEasing('movement', EASING_MODES[i].curve));
    const rateBtns = buttonRow(sectionEl, RATES.map(r => RATE_LABELS.get(r)),
        i => app.setLayerRate('movement', RATES[i]));

    const buttons = document.createElement('div');
    buttons.className = 'effect-buttons';
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => app.stopEffect());
    buttons.appendChild(stopBtn);
    sectionEl.appendChild(buttons);

    /** Highlight the active choice; with no movement playing, disable the row. */
    function mark(btns, isOn, idle) {
        btns.forEach((btn, i) => {
            const on = !idle && isOn(i);
            btn.disabled = idle;
            btn.style.background = on ? '#FFD700' : '#333';
            btn.style.color = on ? '#000' : (idle ? '#555' : '#aaa');
        });
    }

    function refresh() {
        const playing = app.nowPlaying().movement;
        const idle = playing.rate === null;
        name.textContent = EFFECTS[app.currentMovement]?.label ?? 'None';
        intensity.setDisabled(idle);
        intensity.show(playing.intensity ?? 1);
        mark(easingBtns, i => sameCurve(EASING_MODES[i].curve, playing.easing), idle);
        mark(rateBtns, i => RATES[i] === playing.rate, idle);
    }

    refresh();
    return refresh;
}
