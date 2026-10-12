// --- Color panel: global filter ("Todos") plus a per-color offset ---
// Click a chip to edit it, Shift+click to add or remove colors from the
// selection, double click to clear a color's offset (on "Todos": reset the
// global value). A dot marks a color with its own offset.
import { CONFIG } from '../config.js';
import {
    FILTER_DEFS, NEUTRAL_FILTER, GLOBAL_SELECTION,
    readSelection, writeSelection, hasOffset, clearOffset,
} from '../color-filter.js';
import { colorHex } from './color-controls.js';
import { createSlider } from './slider.js';

/** Selection after a click on `slot` (null = "Todos"); Shift toggles the color in a multi-selection. */
function nextSelection(selection, slot, shiftKey) {
    if (slot === null) return GLOBAL_SELECTION;
    if (!shiftKey) return [slot];
    const next = selection.includes(slot) ? selection.filter(s => s !== slot) : [...selection, slot];
    return next.length === 0 ? GLOBAL_SELECTION : next;
}

/**
 * Builds the chip row and the sliders in `sectionEl`.
 * @returns {Function} refresh: redraws swatches, dots and slider values from CONFIG.
 */
export function createFilterControls(sectionEl, app) {
    const model = CONFIG.colorFilter;
    let selection = GLOBAL_SELECTION;

    const chipRow = document.createElement('div');
    chipRow.className = 'color-chips';
    sectionEl.appendChild(chipRow);
    const sliderBox = document.createElement('div');
    sectionEl.appendChild(sliderBox);

    const chips = [null, 0, 1, 2, 3, 4].map(slot => {
        const chip = document.createElement('button');
        chip.className = 'color-chip';
        chip.title = 'Shift+clic: varios colores · doble clic: quitar ajuste';
        const swatch = document.createElement('span');
        swatch.className = 'chip-swatch';
        const label = document.createElement('span');
        label.textContent = slot === null ? 'Todos' : String(slot + 1);
        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        chip.append(swatch, label, dot);
        chip.addEventListener('click', e => {
            selection = nextSelection(selection, slot, e.shiftKey);
            buildSliders();
            refresh();
        });
        chip.addEventListener('dblclick', () => {
            if (slot === null) Object.assign(model.global, NEUTRAL_FILTER);
            else clearOffset(model, slot);
            app.columnManager.applyFilters();
            buildSliders();
            refresh();
        });
        chipRow.appendChild(chip);
        return { chip, swatch, dot, slot };
    });

    let sliders = [];

    // A color's track is centered on the global value, so its double click
    // clears that setting's offset; "Todos" is centered on the neutral value.
    function buildSliders() {
        sliderBox.innerHTML = '';
        const editing = selection;
        sliders = FILTER_DEFS.map(({ key, label, min, max, decimals }) => ({
            key,
            slider: createSlider(sliderBox, {
                label, min, max, decimals,
                defaultValue: editing.length === 0 ? NEUTRAL_FILTER[key] : model.global[key],
                value: readSelection(model, editing, key),
                onChange: v => {
                    writeSelection(model, editing, key, v);
                    app.columnManager.applyFilters();
                    refreshChips();
                },
            }),
        }));
    }

    function refreshChips() {
        for (const { chip, swatch, dot, slot } of chips) {
            const selected = slot === null ? selection.length === 0 : selection.includes(slot);
            chip.classList.toggle('active', selected);
            swatch.style.background = slot === null
                ? `linear-gradient(90deg,${CONFIG.colorOrder.map(colorHex).join(',')})`
                : colorHex(CONFIG.colorOrder[slot]);
            dot.classList.toggle('on', slot !== null && hasOffset(model, slot));
        }
    }

    function refresh() {
        refreshChips();
        for (const { key, slider } of sliders) slider.show(readSelection(model, selection, key));
    }

    buildSliders();
    refresh();
    return refresh;
}
