// --- Filter Controls (per-column + neutral: brightness, contrast, saturation, hue, temperature) ---
import { CONFIG } from '../config.js';

const FILTER_DEFS = [
    { key: 'brightness',  label: 'Bright',  min: -50,  max: 50,  step: 1,    format: v => v },
    { key: 'contrast',    label: 'Contrast', min: 0,    max: 2,   step: 0.05, format: v => v.toFixed(2) },
    { key: 'saturation',  label: 'Saturate', min: 0,    max: 3,   step: 0.05, format: v => v.toFixed(2) },
    { key: 'hue',         label: 'Hue',      min: -180, max: 180, step: 1,    format: v => v + '\u00B0' },
    { key: 'temperature', label: 'Temp',     min: -100, max: 100, step: 1,    format: v => v },
];

const TAB_COLORS = ['#FFD700', '#55AAFF', '#FF4444', '#44FF44', '#FF44FF'];

// Tab modes: -1=ALL, 0-4=column, 'neutral'=| key
export function createFilterControls(sectionEl, app) {
    let selectedCol = -1; // -1=ALL, 0-4=column, 'neutral'=neutral filter

    // --- Column selector tabs ---
    const tabBar = document.createElement('div');
    tabBar.className = 'filter-tabs';

    const allTab = createTab('ALL', -1);
    tabBar.appendChild(allTab);

    for (let i = 0; i < 5; i++) {
        tabBar.appendChild(createTab(String(i + 1), i));
    }

    // Neutral tab (| key)
    const neutralTab = createTab('|', 'neutral');
    neutralTab.style.borderBottomColor = '#888';
    neutralTab.style.borderStyle = 'dashed';
    neutralTab.style.borderBottomStyle = 'solid';
    tabBar.appendChild(neutralTab);

    sectionEl.appendChild(tabBar);

    // --- Slider rows ---
    const sliders = {};

    for (const def of FILTER_DEFS) {
        const row = document.createElement('div');
        row.className = 'layout-row';

        const lbl = document.createElement('label');
        lbl.textContent = def.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = def.min;
        slider.max = def.max;
        slider.step = def.step;

        const val = document.createElement('span');
        val.className = 'range-value';

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            val.textContent = def.format(v);

            if (selectedCol === 'neutral') {
                CONFIG.neutralFilter[def.key] = v;
                // Re-apply filters to any currently-neutral columns
                app.columnManager.applyFilters();
            } else if (selectedCol === -1) {
                for (let i = 0; i < 5; i++) {
                    CONFIG.filters[def.key][i] = v;
                }
                app.columnManager.applyFilters();
            } else {
                CONFIG.filters[def.key][selectedCol] = v;
                app.columnManager.applyFilters(selectedCol);
            }
        });

        sliders[def.key] = { slider, val, def };

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(val);
        sectionEl.appendChild(row);
    }

    // --- Helpers ---
    function createTab(label, colIndex) {
        const tab = document.createElement('button');
        tab.className = 'filter-tab' + (colIndex === -1 ? ' active' : '');
        tab.textContent = label;

        if (typeof colIndex === 'number' && colIndex >= 0) {
            tab.style.borderBottomColor = TAB_COLORS[colIndex];
        }

        tab.addEventListener('click', () => {
            selectedCol = colIndex;
            tabBar.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            refreshSliders();
        });
        return tab;
    }

    function refreshSliders() {
        for (const { slider, val, def } of Object.values(sliders)) {
            let v;
            if (selectedCol === 'neutral') {
                v = CONFIG.neutralFilter[def.key];
            } else if (selectedCol === -1) {
                v = CONFIG.filters[def.key][0];
            } else {
                v = CONFIG.filters[def.key][selectedCol];
            }
            slider.value = v;
            val.textContent = def.format(v);
        }
    }

    refreshSliders();
}
