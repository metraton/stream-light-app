// --- Glow Controls (GlowFilter params + sequence engine) ---
import { CONFIG } from '../config.js';
import { GLOW_SEQUENCES } from '../glow-sequences.js';

export function createGlowControls(sectionEl, app) {
    const g = CONFIG.glow;
    const cm = app.columnManager;

    // === Parameters ===
    const paramHeader = document.createElement('div');
    paramHeader.className = 'effect-name';
    paramHeader.textContent = 'Parameters';
    sectionEl.appendChild(paramHeader);

    addSlider(sectionEl, 'Strength', 0, 10, 0.5, g.outerStrength, v => {
        g.outerStrength = v;
        cm.updateGlowParams();
    });

    addSlider(sectionEl, 'Distance', 2, 25, 1, g.distance, v => {
        g.distance = v;
        cm.rebuild();
        app.reapplyColors();
    });

    addSlider(sectionEl, 'Quality', 0.05, 0.5, 0.05, g.quality, v => {
        g.quality = v;
        cm.rebuild();
        app.reapplyColors();
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

    // === Sequences ===
    const seqHeader = document.createElement('div');
    seqHeader.className = 'effect-name';
    seqHeader.textContent = 'Glow — Secuencia animada';
    seqHeader.style.marginTop = '10px';
    sectionEl.appendChild(seqHeader);

    // Sequence selector
    const seqRow = document.createElement('div');
    seqRow.className = 'effect-row';

    const seqLabel = document.createElement('label');
    seqLabel.textContent = 'Pattern';

    const seqSelect = document.createElement('select');
    let firstKey = null;
    for (const [key, def] of Object.entries(GLOW_SEQUENCES)) {
        if (!firstKey) firstKey = key;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = def.label;
        seqSelect.appendChild(opt);
    }

    seqRow.appendChild(seqLabel);
    seqRow.appendChild(seqSelect);
    sectionEl.appendChild(seqRow);

    // Speed slider (updates based on selected sequence)
    const speedRow = document.createElement('div');
    speedRow.className = 'effect-row';

    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed';

    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';

    const speedVal = document.createElement('span');
    speedVal.className = 'range-value';

    function updateSpeedSlider() {
        const key = seqSelect.value;
        const def = GLOW_SEQUENCES[key];
        const [min, max] = def.speedRange || [30, 500];
        speedSlider.min = min;
        speedSlider.max = max;
        // Coarser, comfortable step (~20 stops across the range).
        speedSlider.step = (max - min) <= 200 ? 10 : 20;
        speedSlider.value = def.phaseDuration;
        speedVal.textContent = def.phaseDuration + 'ms';
    }
    updateSpeedSlider();

    speedSlider.addEventListener('input', () => {
        const key = seqSelect.value;
        GLOW_SEQUENCES[key].phaseDuration = parseInt(speedSlider.value);
        speedVal.textContent = speedSlider.value + 'ms';
    });

    seqSelect.addEventListener('change', () => {
        updateSpeedSlider();
        // If already playing, switch to new sequence
        if (app.glowEngine.isPlaying) {
            app.playGlowEffect(seqSelect.value);
        }
    });

    speedRow.appendChild(speedLabel);
    speedRow.appendChild(speedSlider);
    speedRow.appendChild(speedVal);
    sectionEl.appendChild(speedRow);

    // Easing selector
    const easingRow = document.createElement('div');
    easingRow.className = 'effect-row';

    const easingLabel = document.createElement('label');
    easingLabel.textContent = 'Suavizado';

    const easingSelect = document.createElement('select');
    // Labels match perceived behavior: 'Suave' = linear (continuous, smoothest);
    // the ease-in-out curves read as a pulse at these durations.
    const easings = [
        { value: 'linear',         label: 'Suave' },
        { value: 'easeInOutSine',  label: 'Pulsada' },
        { value: 'easeInOutCubic', label: 'Pulsada fuerte' },
    ];
    for (const { value, label } of easings) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        easingSelect.appendChild(opt);
    }
    // Set initial easing from selected sequence
    easingSelect.value = GLOW_SEQUENCES[seqSelect.value]?.easing || 'linear';

    easingSelect.addEventListener('change', () => {
        const key = seqSelect.value;
        GLOW_SEQUENCES[key].easing = easingSelect.value;
    });

    seqSelect.addEventListener('change', () => {
        easingSelect.value = GLOW_SEQUENCES[seqSelect.value]?.easing || 'linear';
    });

    easingRow.appendChild(easingLabel);
    easingRow.appendChild(easingSelect);
    sectionEl.appendChild(easingRow);

    // Play / Stop buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'effect-buttons';

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => {
        app.playGlowEffect(seqSelect.value);
    });

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => {
        app.stopGlowEffect();
    });

    btnRow.appendChild(playBtn);
    btnRow.appendChild(stopBtn);
    sectionEl.appendChild(btnRow);
}

function addSlider(parent, label, min, max, step, value, onChange) {
    const row = document.createElement('div');
    row.className = 'layout-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;

    const val = document.createElement('span');
    val.className = 'range-value';
    val.textContent = Number.isInteger(value) ? value : value.toFixed(2);

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        val.textContent = Number.isInteger(v) ? v : v.toFixed(2);
        onChange(v);
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(val);
    parent.appendChild(row);
}
