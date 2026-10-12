// --- Layout default: the user's saved layout, otherwise the factory one ---
// It holds only the fields the Layout sliders edit. Rotation follows the camera
// and the FPS cap is an app setting, so neither is ever stored or restored here.
import { DEFAULTS } from './config.js';

/** The Layout sliders; their ranges also bound what a stored default may hold. */
export const LAYOUT_DEFS = [
    { key: 'gap', label: 'Gap', min: 0, max: 40, decimals: 0 },
    { key: 'margin', label: 'Margin', min: 0, max: 60, decimals: 0 },
    { key: 'cornerRadius', label: 'Radius', min: 0, max: 30, decimals: 0 },
    { key: 'zoom', label: 'Zoom', min: 0.8, max: 1.5, decimals: 2 },
    { key: 'spread', label: 'Spread', min: 0.5, max: 1.5, decimals: 2 },
];

export const LAYOUT_DEFAULT_KEY = 'streamlight-layout-default';

/** The layout fields of a columns object such as CONFIG.columns. */
export function pickLayout(columns) {
    return Object.fromEntries(LAYOUT_DEFS.map(({ key }) => [key, columns[key]]));
}

/** The factory layout from config.js. */
export function factoryLayout() {
    return pickLayout(DEFAULTS.columns);
}

/** `data` reduced to the layout fields; a missing, non-numeric or out-of-range field takes the factory value. */
export function validateLayout(data) {
    const factory = factoryLayout();
    return Object.fromEntries(LAYOUT_DEFS.map(({ key, min, max }) => {
        const value = data?.[key];
        const valid = Number.isFinite(value) && value >= min && value <= max;
        return [key, valid ? value : factory[key]];
    }));
}

/** The saved user default, validated; null when none is saved or the stored text is not a JSON object. */
export function loadUserLayout(storage = localStorage) {
    let data;
    try {
        data = JSON.parse(storage.getItem(LAYOUT_DEFAULT_KEY));
    } catch {
        return null;
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
    return validateLayout(data);
}

/** Store the layout fields of `columns` as the user's default. */
export function saveUserLayout(columns, storage = localStorage) {
    storage.setItem(LAYOUT_DEFAULT_KEY, JSON.stringify(validateLayout(pickLayout(columns))));
}

export function clearUserLayout(storage = localStorage) {
    storage.removeItem(LAYOUT_DEFAULT_KEY);
}

/** The layout Reset restores: the user's saved default, otherwise the factory one. */
export function activeLayoutDefault(storage = localStorage) {
    return loadUserLayout(storage) ?? factoryLayout();
}
