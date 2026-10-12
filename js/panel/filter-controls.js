// --- Filter Controls (per color + neutral: brightness, contrast, saturation, hue, temperature) ---
import { CONFIG, DEFAULTS } from '../config.js';
import { createSlider } from './slider.js';

// Ranges keep the values that still look like the camera image; the slider is
// fine around the neutral default (config.js) and coarse at the ends.
const FILTER_DEFS = [
    { key: 'brightness',  label: 'Bright',   min: -30, max: 30,  decimals: 0 },
    { key: 'contrast',    label: 'Contrast', min: 0.5, max: 1.5, decimals: 2 },
    { key: 'saturation',  label: 'Saturate', min: 0,   max: 2,   decimals: 2 },
    { key: 'hue',         label: 'Hue',      min: -90, max: 90,  decimals: 0 },
    { key: 'temperature', label: 'Temp',     min: -60, max: 60,  decimals: 0 },
];

const TAB_COLORS = ['#FFD700', '#55AAFF', '#FF4444', '#44FF44', '#FF44FF'];

/** Tab values: ALL writes every color slot, 0-4 one color slot (CONFIG.colorOrder), NEUTRAL the | filter. */
const ALL = -1;
const NEUTRAL = 'neutral';

/** Store `value` for filter `key` under `tab`; columnManager.applyFilters() then
 *  gives each column the set of the color it shows. */
export function writeFilter(tab, key, value) {
    if (tab === NEUTRAL) {
        CONFIG.neutralFilter[key] = value;
    } else if (tab === ALL) {
        CONFIG.filters[key].fill(value);
    } else {
        CONFIG.filters[key][tab] = value;
    }
}

/** The value of filter `key` that `tab` shows; ALL shows the first color slot. */
export function readFilter(tab, key) {
    if (tab === NEUTRAL) return CONFIG.neutralFilter[key];
    return CONFIG.filters[key][tab === ALL ? 0 : tab];
}

export function createFilterControls(sectionEl, app) {
    let selectedTab = ALL;

    const tabBar = document.createElement('div');
    tabBar.className = 'filter-tabs';
    tabBar.appendChild(createTab('ALL', ALL));
    for (let i = 0; i < 5; i++) {
        tabBar.appendChild(createTab(String(i + 1), i));
    }
    const neutralTab = createTab('|', NEUTRAL);
    neutralTab.style.borderBottomColor = '#888';
    neutralTab.style.borderStyle = 'dashed';
    neutralTab.style.borderBottomStyle = 'solid';
    tabBar.appendChild(neutralTab);
    sectionEl.appendChild(tabBar);

    const sliders = FILTER_DEFS.map(({ key, label, min, max, decimals }) => ({
        key,
        slider: createSlider(sectionEl, {
            label, min, max, decimals,
            defaultValue: DEFAULTS.neutralFilter[key], value: readFilter(selectedTab, key),
            onChange: v => {
                writeFilter(selectedTab, key, v);
                app.columnManager.applyFilters();
            },
        }),
    }));

    function createTab(label, tabValue) {
        const tab = document.createElement('button');
        tab.className = 'filter-tab' + (tabValue === ALL ? ' active' : '');
        tab.textContent = label;
        if (typeof tabValue === 'number' && tabValue >= 0) {
            tab.style.borderBottomColor = TAB_COLORS[tabValue];
        }
        tab.addEventListener('click', () => {
            selectedTab = tabValue;
            tabBar.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            for (const { key, slider } of sliders) slider.show(readFilter(selectedTab, key));
        });
        return tab;
    }
}
