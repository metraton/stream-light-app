// --- Movimiento section, and the intensity and Stop controls it shares with Glow ---
import { createSlider } from './slider.js';
import { activeLine } from './layer-controls.js';

/** Bounds of the intensity slider; app.js importTweaks clamps a stored intensity to them. */
export const INTENSITY_MIN = 0.5;
export const INTENSITY_MAX = 1.5;

/** Mark the button isOn picks as active; an idle row is disabled and nothing is picked. */
export function markChoice(btns, isOn, idle = false) {
    btns.forEach((btn, i) => {
        btn.disabled = idle;
        btn.classList.toggle('is-active', !idle && isOn(i));
    });
}

/**
 * Intensity slider and Stop for what `layer` ('movement' or 'glow') plays now.
 * Returns refresh(), which follows app.nowPlaying().
 */
export function createLayerTweaks(parent, app, layer, onStop) {
    const intensity = createSlider(parent, {
        label: 'Intensidad', min: INTENSITY_MIN, max: INTENSITY_MAX, defaultValue: 1, decimals: 2,
        onChange: v => app.setLayerIntensity(layer, v),
    });

    const buttons = document.createElement('div');
    buttons.className = 'btn-grid';
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
    };
}

/** Builds the Movimiento section; returns its refresh callback. */
export function createEffectControls(sectionEl, app) {
    const setName = activeLine(sectionEl, 'Movimiento');
    const refreshTweaks = createLayerTweaks(sectionEl, app, 'movement', () => app.stopEffect());

    function refresh() {
        setName(app.nowPlaying().movement.label);
        refreshTweaks();
    }

    refresh();
    return refresh;
}
