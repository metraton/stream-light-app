// --- Effect Controls (single combo box, mirrors Glow → Sequences UI) ---
// One dropdown selects the effect; a shared Speed slider + Suavizado select +
// Play/Stop operate on the currently-selected effect's def in EFFECTS.
// The Sequencer section's Movement quick-buttons are separate and unchanged.
import { EFFECTS } from '../effects.js';

// Labels match PERCEIVED behavior, not the math name. At these phase durations
// the ease-in-out curves dwell near each phase boundary and read as a pulse,
// while linear reads as continuous/smooth. So 'Suave' = linear (smoothest felt).
const EASINGS = [
    { value: 'linear',         label: 'Suave' },          // continuous, smoothest
    { value: 'easeInOutSine',  label: 'Pulsada' },         // gentle ease-in-out pulse
    { value: 'easeInOutCubic', label: 'Pulsada fuerte' },  // stronger pulse
];

export function createEffectControls(sectionEl, app) {
    const keys = Object.keys(EFFECTS);
    let selected = keys[0]; // currently-selected effect key

    // --- Effect selector (combo box) ---
    const selRow = document.createElement('div');
    selRow.className = 'effect-row';

    const selLabel = document.createElement('label');
    selLabel.textContent = 'Effect';

    const effectSelect = document.createElement('select');
    for (const key of keys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = EFFECTS[key].label || key;
        effectSelect.appendChild(opt);
    }

    selRow.appendChild(selLabel);
    selRow.appendChild(effectSelect);
    sectionEl.appendChild(selRow);

    // --- Speed slider (bound to selected effect) ---
    const speedRow = document.createElement('div');
    speedRow.className = 'effect-row';

    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed';

    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';

    const speedValue = document.createElement('span');
    speedValue.className = 'range-value';

    speedRow.appendChild(speedLabel);
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedValue);
    sectionEl.appendChild(speedRow);

    // --- Suavizado (easing) select (bound to selected effect) ---
    const easingRow = document.createElement('div');
    easingRow.className = 'effect-row';

    const easingLabel = document.createElement('label');
    easingLabel.textContent = 'Suavizado';

    const easingSelect = document.createElement('select');
    for (const { value, label } of EASINGS) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        easingSelect.appendChild(opt);
    }

    easingRow.appendChild(easingLabel);
    easingRow.appendChild(easingSelect);
    sectionEl.appendChild(easingRow);

    // --- Play / Stop buttons ---
    const buttons = document.createElement('div');
    buttons.className = 'effect-buttons';

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => {
        app.playMovement(selected); // sets app.currentMovement -> highlights the Movement button
    });

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => {
        app.stopEffect();
    });

    buttons.appendChild(playBtn);
    buttons.appendChild(stopBtn);
    sectionEl.appendChild(buttons);

    // --- Load the selected effect's current speed + easing into the controls ---
    function loadSelected() {
        const def = EFFECTS[selected];
        const [min, max] = def.speedRange || [50, 2000];
        // Comfortable, coarser granularity (~20 stops, round 20/50 ms increment).
        const step = (max - min) <= 400 ? 20 : 50;
        speedSlider.min = String(min);
        speedSlider.max = String(max);
        speedSlider.step = String(step);
        speedSlider.value = def.phaseDuration;
        speedValue.textContent = def.phaseDuration + 'ms';
        easingSelect.value = def.easing || 'easeInOutSine';
    }

    // --- Wiring: writes back to the selected effect's def in EFFECTS ---
    effectSelect.addEventListener('change', () => {
        selected = effectSelect.value;
        loadSelected();
    });

    speedSlider.addEventListener('input', () => {
        EFFECTS[selected].phaseDuration = parseInt(speedSlider.value);
        speedValue.textContent = speedSlider.value + 'ms';
    });

    easingSelect.addEventListener('change', () => {
        EFFECTS[selected].easing = easingSelect.value;
    });

    loadSelected();
}
