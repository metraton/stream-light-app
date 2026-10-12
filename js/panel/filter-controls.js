// --- Color panel: global filter ("Todos") plus a per-color offset, and per-color effects ---
// Click a chip to edit it, Shift+click to add or remove colors from the
// selection, double click to clear a color's offset (on "Todos": reset the
// global value). A dot marks a color with its own offset and a star a color
// with effects. Reset does the dots for every color at once, Reset efectos the
// stars; the hex colors are not part of the filter. The effect buttons and
// sliders act on the same selection as the adjust sliders.
import { CONFIG } from '../config.js';
import {
    FILTER_DEFS, NEUTRAL_FILTER, GLOBAL_SELECTION,
    readSelection, writeSelection, hasOffset, clearOffset, resetColorFilter,
} from '../color-filter.js';
import {
    hasEffect, addEffect, removeEffect, setEffectParam, clearEffects, resetEffectStack,
} from '../effect-stack.js';
import { EFFECTS } from '../effects-registry.js';
import { colorHex } from './color-controls.js';
import { createSlider } from './slider.js';

/** Selection after a click on `slot` (null = "Todos"); Shift toggles the color in a multi-selection. */
function nextSelection(selection, slot, shiftKey) {
    if (slot === null) return GLOBAL_SELECTION;
    if (!shiftKey) return [slot];
    const next = selection.includes(slot) ? selection.filter(s => s !== slot) : [...selection, slot];
    return next.length === 0 ? GLOBAL_SELECTION : next;
}

/** The effect-stack targets of a selection: null ("Todos") for GLOBAL_SELECTION, else the slots. */
const targetsOf = selection => (selection.length === 0 ? [null] : selection);

const hasAnyEffect = (stack, target) => EFFECTS.some(({ id }) => hasEffect(stack, target, id));

/**
 * Builds the chip row, the adjust sliders, Reset, and the effects block in `sectionEl`.
 * @returns {Function} refresh: redraws swatches, markers, effect controls and slider values from CONFIG.
 */
export function createFilterControls(sectionEl, app) {
    const model = CONFIG.colorFilter;
    const stack = CONFIG.effectStack;
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
        const fx = document.createElement('span');
        fx.textContent = '✦';
        fx.title = 'Tiene efectos';
        fx.style.fontSize = '9px';
        fx.style.color = '#FFD700';
        chip.append(swatch, label, dot, fx);
        chip.addEventListener('click', e => {
            selection = nextSelection(selection, slot, e.shiftKey);
            buildSliders();
            buildEffects();
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
        return { chip, swatch, dot, fx, slot };
    });

    const resetRow = document.createElement('div');
    resetRow.className = 'preset-row';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Todos a neutro y ningún color con ajuste propio (los hex no cambian)';
    resetBtn.style.flex = '1';
    resetBtn.addEventListener('click', () => {
        resetColorFilter(model);
        app.columnManager.applyFilters();
        buildSliders();
        refresh();
    });
    resetRow.appendChild(resetBtn);
    sectionEl.appendChild(resetRow);

    const effectsTitle = document.createElement('div');
    effectsTitle.className = 'layout-row';
    const effectsLabel = document.createElement('label');
    effectsLabel.textContent = 'Efectos';
    effectsTitle.appendChild(effectsLabel);
    sectionEl.appendChild(effectsTitle);

    const effectButtons = document.createElement('div');
    effectButtons.className = 'effect-buttons';
    sectionEl.appendChild(effectButtons);
    const noneBtn = document.createElement('button');
    noneBtn.textContent = 'None';
    noneBtn.title = 'Quita todos los efectos de la selección';
    noneBtn.addEventListener('click', () => {
        for (const target of targetsOf(selection)) clearEffects(stack, target);
        effectsChanged();
    });
    effectButtons.appendChild(noneBtn);
    const toggles = EFFECTS.map(({ id, label }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.title = 'Activa o quita el efecto en la selección';
        btn.addEventListener('click', () => {
            const targets = targetsOf(selection);
            const turnOn = !hasEffect(stack, targets[0], id);
            for (const target of targets) {
                if (turnOn) addEffect(stack, target, id);
                else removeEffect(stack, target, id);
            }
            effectsChanged();
        });
        effectButtons.appendChild(btn);
        return { btn, id };
    });

    const effectParamBox = document.createElement('div');
    sectionEl.appendChild(effectParamBox);

    const effectsResetRow = document.createElement('div');
    effectsResetRow.className = 'preset-row';
    const effectsResetBtn = document.createElement('button');
    effectsResetBtn.textContent = 'Reset efectos';
    effectsResetBtn.title = 'Quita los efectos de Todos y de cada color';
    effectsResetBtn.style.flex = '1';
    effectsResetBtn.addEventListener('click', () => {
        resetEffectStack(stack);
        effectsChanged();
    });
    effectsResetRow.appendChild(effectsResetBtn);
    sectionEl.appendChild(effectsResetRow);

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

    function effectsChanged() {
        app.columnManager.applyFilters();
        buildEffects();
        refreshChips();
    }

    /** Write one param to every selected target that runs effect `id`. */
    function writeEffectParam(targets, id, key, value) {
        for (const target of targets) setEffectParam(stack, target, id, key, value);
        app.columnManager.applyFilters();
    }

    // The params shown are those of the first selected target, like the adjust
    // sliders; an edit goes to every selected target running that effect.
    function buildEffects() {
        const targets = targetsOf(selection);
        const list = targets[0] === null ? stack.global : stack.slots[targets[0]];
        noneBtn.classList.toggle('active', list.length === 0);
        for (const { btn, id } of toggles) btn.classList.toggle('active', hasEffect(stack, targets[0], id));

        effectParamBox.innerHTML = '';
        for (const { id, params } of list) {
            const effect = EFFECTS.find(def => def.id === id);
            for (const param of effect.params) {
                const label = `${effect.label} · ${param.label}`;
                if (param.options) {
                    const row = document.createElement('div');
                    row.className = 'effect-buttons';
                    row.title = label;
                    for (const option of param.options) {
                        const btn = document.createElement('button');
                        btn.textContent = `${param.label}: ${option.label}`;
                        btn.classList.toggle('active', params[param.key] === option.value);
                        btn.addEventListener('click', () => {
                            writeEffectParam(targets, id, param.key, option.value);
                            buildEffects();
                        });
                        row.appendChild(btn);
                    }
                    effectParamBox.appendChild(row);
                } else {
                    createSlider(effectParamBox, {
                        label, min: param.min, max: param.max, decimals: param.decimals,
                        defaultValue: effect.defaults[param.key],
                        value: params[param.key],
                        onChange: v => writeEffectParam(targets, id, param.key, v),
                    });
                }
            }
        }
    }

    function refreshChips() {
        for (const { chip, swatch, dot, fx, slot } of chips) {
            const selected = slot === null ? selection.length === 0 : selection.includes(slot);
            chip.classList.toggle('active', selected);
            swatch.style.background = slot === null
                ? `linear-gradient(90deg,${CONFIG.colorOrder.map(colorHex).join(',')})`
                : colorHex(CONFIG.colorOrder[slot]);
            dot.classList.toggle('on', slot !== null && hasOffset(model, slot));
            fx.style.visibility = hasAnyEffect(stack, slot) ? 'visible' : 'hidden';
        }
    }

    function refresh() {
        refreshChips();
        for (const { key, slider } of sliders) slider.show(readSelection(model, selection, key));
    }

    buildSliders();
    buildEffects();
    refresh();
    return refresh;
}
