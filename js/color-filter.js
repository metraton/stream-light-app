// --- Color filter model: one global setting plus a per-color offset ---
// A column's effective setting is the global ("Todos") value plus the offset of
// the color slot it shows (CONFIG.colorOrder); an uncolored column gets the
// global value alone. Offsets are kept by slot, so a color set that changes the
// hex values leaves them on the same slot.

// Ranges keep the values that still look like the camera image; the panel
// slider is fine around the neutral value and coarse at the ends. Effective
// values are clamped to the same ranges.
export const FILTER_DEFS = [
    { key: 'brightness',  label: 'Bright',   min: -30, max: 30,  decimals: 0 },
    { key: 'contrast',    label: 'Contrast', min: 0.5, max: 1.5, decimals: 2 },
    { key: 'saturation',  label: 'Saturate', min: 0,   max: 2,   decimals: 2 },
    { key: 'hue',         label: 'Hue',      min: -90, max: 90,  decimals: 0 },
    { key: 'temperature', label: 'Temp',     min: -60, max: 60,  decimals: 0 },
];

/** The settings under which the filter leaves the image unchanged. */
export const NEUTRAL_FILTER = Object.freeze({ brightness: 0, contrast: 1, saturation: 1, hue: 0, temperature: 0 });

/** The selection that edits the global value: no color slot. */
export const GLOBAL_SELECTION = Object.freeze([]);

const SLOT_COUNT = 5;

const zeroOffset = () => Object.fromEntries(FILTER_DEFS.map(({ key }) => [key, 0]));
const roundTo = (value, decimals) => Number(value.toFixed(decimals));
const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

/** A neutral model: global at NEUTRAL_FILTER, every slot without an offset. */
export function createColorFilter() {
    return {
        global: { ...NEUTRAL_FILTER },
        offsets: Array.from({ length: SLOT_COUNT }, zeroOffset),
    };
}

/** The settings a column showing color `slot` gets; a slot outside 0-4 (uncolored) gets the global value. */
export function effectiveFilter(model, slot) {
    const offset = model.offsets[slot];
    return Object.fromEntries(FILTER_DEFS.map(def => {
        const value = model.global[def.key] + (offset ? offset[def.key] : 0);
        return [def.key, roundTo(clamp(value, def), def.decimals)];
    }));
}

/** True when every effective value is neutral, so the filter can be skipped. */
export function isNeutral(settings) {
    return FILTER_DEFS.every(({ key }) => settings[key] === NEUTRAL_FILTER[key]);
}

/**
 * The value the slider for `key` shows: the global value for GLOBAL_SELECTION,
 * otherwise the effective value of the first selected slot.
 */
export function readSelection(model, selection, key) {
    return selection.length === 0 ? model.global[key] : effectiveFilter(model, selection[0])[key];
}

/**
 * Set `key` to `value` for the selection: the global value for
 * GLOBAL_SELECTION, otherwise the offset that gives every selected slot the
 * effective value `value`.
 */
export function writeSelection(model, selection, key, value) {
    if (selection.length === 0) {
        model.global[key] = value;
        return;
    }
    const { decimals } = FILTER_DEFS.find(def => def.key === key);
    for (const slot of selection) {
        model.offsets[slot][key] = roundTo(value - model.global[key], decimals);
    }
}

export function hasOffset(model, slot) {
    return FILTER_DEFS.some(({ key }) => model.offsets[slot][key] !== 0);
}

export function clearOffset(model, slot) {
    model.offsets[slot] = zeroOffset();
}

/** Return `model` to neutral: global at NEUTRAL_FILTER and no color with an offset. */
export function resetColorFilter(model) {
    Object.assign(model.global, NEUTRAL_FILTER);
    for (let slot = 0; slot < SLOT_COUNT; slot++) clearOffset(model, slot);
}

/**
 * Convert the absolute per-slot settings used before the global/offset model
 * ({ key: [5 values] } plus the uncolored set) without changing what any
 * column shows: the uncolored set becomes the global value, and each slot's
 * offset is its old value minus that global value. Presets saved before the
 * change carry no uncolored set, so their global value is NEUTRAL_FILTER.
 */
export function migrateLegacyFilters(filters, neutralFilter = NEUTRAL_FILTER) {
    const model = createColorFilter();
    for (const { key, decimals } of FILTER_DEFS) {
        const global = Number.isFinite(neutralFilter[key]) ? neutralFilter[key] : NEUTRAL_FILTER[key];
        model.global[key] = global;
        const values = Array.isArray(filters[key]) ? filters[key] : [];
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            const old = Number.isFinite(values[slot]) ? values[slot] : global;
            model.offsets[slot][key] = roundTo(old - global, decimals);
        }
    }
    return model;
}

/** A model rebuilt from persisted data, keeping only finite numbers; anything else starts neutral. */
export function restoreColorFilter(data) {
    const model = createColorFilter();
    for (const { key } of FILTER_DEFS) {
        if (Number.isFinite(data?.global?.[key])) model.global[key] = data.global[key];
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            const value = data?.offsets?.[slot]?.[key];
            if (Number.isFinite(value)) model.offsets[slot][key] = value;
        }
    }
    return model;
}
