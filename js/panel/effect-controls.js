// --- Effect Controls ---
import { EFFECTS } from '../effects.js';

export function createEffectControls(sectionEl, app) {
    for (const [name, def] of Object.entries(EFFECTS)) {
        const block = document.createElement('div');
        block.className = 'effect-block';

        // Effect name
        const nameEl = document.createElement('div');
        nameEl.className = 'effect-name';
        nameEl.textContent = def.label || name;
        block.appendChild(nameEl);

        // Speed slider
        const speedRow = document.createElement('div');
        speedRow.className = 'effect-row';

        const speedLabel = document.createElement('label');
        speedLabel.textContent = 'Speed';

        const [rangeMin, rangeMax] = def.speedRange || [50, 2000];
        const step = rangeMin < 100 ? 5 : 50;

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = String(rangeMin);
        speedSlider.max = String(rangeMax);
        speedSlider.step = String(step);
        speedSlider.value = def.phaseDuration;

        const speedValue = document.createElement('span');
        speedValue.className = 'range-value';
        speedValue.textContent = def.phaseDuration + 'ms';

        speedSlider.addEventListener('input', () => {
            def.phaseDuration = parseInt(speedSlider.value);
            speedValue.textContent = speedSlider.value + 'ms';
        });

        speedRow.appendChild(speedLabel);
        speedRow.appendChild(speedSlider);
        speedRow.appendChild(speedValue);
        block.appendChild(speedRow);

        // Easing selector
        const easingRow = document.createElement('div');
        easingRow.className = 'effect-row';

        const easingLabel = document.createElement('label');
        easingLabel.textContent = 'Easing';

        const easingSelect = document.createElement('select');
        const easings = ['easeInOutSine', 'easeInOutCubic', 'linear'];
        for (const e of easings) {
            const opt = document.createElement('option');
            opt.value = e;
            opt.textContent = e;
            if (e === (def.easing || 'easeInOutSine')) opt.selected = true;
            easingSelect.appendChild(opt);
        }

        easingSelect.addEventListener('change', () => {
            def.easing = easingSelect.value;
        });

        easingRow.appendChild(easingLabel);
        easingRow.appendChild(easingSelect);
        block.appendChild(easingRow);

        // Play / Stop buttons
        const buttons = document.createElement('div');
        buttons.className = 'effect-buttons';

        const playBtn = document.createElement('button');
        playBtn.textContent = 'Play';
        playBtn.addEventListener('click', () => {
            app.playMovement(name);
        });

        const stopBtn = document.createElement('button');
        stopBtn.textContent = 'Stop';
        stopBtn.addEventListener('click', () => {
            app.stopEffect();
        });

        buttons.appendChild(playBtn);
        buttons.appendChild(stopBtn);
        block.appendChild(buttons);

        sectionEl.appendChild(block);
    }
}
