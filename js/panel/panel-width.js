/** min fits a 7-key row without clipping a word; maxShare keeps the stage visible on small windows. */
export const PANEL_WIDTH = Object.freeze({ min: 400, max: 720, default: 440, maxShare: 0.6 });
export const PANEL_WIDTH_KEY = 'streamlight-panel-width';

/** `width` in whole px within min and the smaller of max and maxShare of the viewport, never below min. */
export function clampPanelWidth(width, viewportWidth = Infinity) {
    const max = Math.max(PANEL_WIDTH.min, Math.min(PANEL_WIDTH.max, Math.floor(viewportWidth * PANEL_WIDTH.maxShare)));
    const wanted = Number.isFinite(width) ? width : PANEL_WIDTH.default;
    return Math.round(Math.min(max, Math.max(PANEL_WIDTH.min, wanted)));
}

/** The saved width, clamped to the viewport; the default when none is saved or it is not a number. */
export function loadPanelWidth(viewportWidth = Infinity, storage = localStorage) {
    const stored = storage.getItem(PANEL_WIDTH_KEY);
    const width = stored === null ? NaN : Number(stored);
    return clampPanelWidth(Number.isFinite(width) ? width : PANEL_WIDTH.default, viewportWidth);
}

/** Store `width` clamped to the panel's own bounds; the viewport is applied again on load. */
export function savePanelWidth(width, storage = localStorage) {
    const clamped = clampPanelWidth(width);
    storage.setItem(PANEL_WIDTH_KEY, String(clamped));
    return clamped;
}

export function clearPanelWidth(storage = localStorage) {
    storage.removeItem(PANEL_WIDTH_KEY);
}
