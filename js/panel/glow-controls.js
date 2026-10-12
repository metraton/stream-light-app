// --- Glow Controls: the GlowFilter look ---
// The glow sequence playing now, its rate and its easing are set in
// "Sonando ahora" (layer-controls.js).
import { CONFIG } from '../config.js';

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
