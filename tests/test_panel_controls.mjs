// Panel width, slider steps and narrowed ranges, without a browser. Run: node --test tests/test_panel_controls.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PANEL_WIDTH, PANEL_WIDTH_KEY, clampPanelWidth, loadPanelWidth, savePanelWidth, clearPanelWidth,
} from '../js/panel/panel-width.js';
import { curvedScale, defaultStep, stepValue } from '../js/panel/slider.js';
import { INTENSITY_MIN, INTENSITY_MAX } from '../js/panel/effect-controls.js';
import { GLOW_LOOK_DEFS, clampGlowLook } from '../js/panel/glow-controls.js';
import { LAYOUT_DEFS } from '../js/layout-default.js';
import { FILTER_DEFS, restoreColorFilter } from '../js/color-filter.js';

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
    };
}

test('the panel width defaults to 440 and stays between its bounds', () => {
    assert.equal(PANEL_WIDTH.default, 440);
    assert.equal(clampPanelWidth(100, 1920), PANEL_WIDTH.min);
    assert.equal(clampPanelWidth(5000, 1920), PANEL_WIDTH.max);
    assert.equal(clampPanelWidth(523.6, 1920), 524);
    assert.equal(clampPanelWidth(NaN, 1920), PANEL_WIDTH.default);
});

test('on a small window the panel never takes more than its share, nor less than its minimum', () => {
    assert.equal(clampPanelWidth(700, 1000), 600);
    assert.equal(clampPanelWidth(700, 500), PANEL_WIDTH.min);
});

test('a dragged width persists, loads clamped to the window, and double click forgets it', () => {
    const storage = memoryStorage();
    assert.equal(loadPanelWidth(1920, storage), PANEL_WIDTH.default);
    assert.equal(savePanelWidth(9999, storage), PANEL_WIDTH.max);
    assert.equal(storage.getItem(PANEL_WIDTH_KEY), String(PANEL_WIDTH.max));
    assert.equal(loadPanelWidth(1920, storage), PANEL_WIDTH.max);
    assert.equal(loadPanelWidth(1000, storage), 600);
    clearPanelWidth(storage);
    assert.equal(loadPanelWidth(1920, storage), PANEL_WIDTH.default);
    assert.equal(loadPanelWidth(1920, memoryStorage({ [PANEL_WIDTH_KEY]: 'wide' })), PANEL_WIDTH.default);
});

test('the curved track is fine next to the default and reaches both ends', () => {
    const scale = curvedScale({ low: 0.5, high: 1.5, defaultValue: 1 });
    assert.equal(scale.valueAt(0), 1);
    assert.equal(scale.valueAt(1), 1.5);
    assert.equal(scale.valueAt(-1), 0.5);
    assert.equal(scale.valueAt(0.5), 1.125);
    for (const v of [0.5, 0.8, 1, 1.3, 1.5]) assert.ok(Math.abs(scale.valueAt(scale.positionOf(v)) - v) < 1e-9);
});

test('a wheel notch or arrow key moves one rounded step, about 1/50 of the range', () => {
    assert.equal(defaultStep(0.5, 1.5, 2), 0.02);
    assert.equal(defaultStep(-45, 45, 0), 2);
    assert.equal(defaultStep(4, 16, 0), 1);
    assert.equal(defaultStep(80, 260, 0), 5);
    const range = { low: 0.5, high: 1.5, step: 0.02, decimals: 2 };
    assert.equal(stepValue(1, 1, range), 1.02);
    assert.equal(stepValue(1, -1, range), 0.98);
    assert.equal(stepValue(1.013, 1, range), 1.04, 'snaps to the step grid');
});

test('Shift steps a tenth as far, never finer than the shown decimals, and steps stop at the ends', () => {
    const range = { low: 0.5, high: 1.5, step: 0.02, decimals: 2 };
    assert.equal(stepValue(1, 1, range, true), 1.01);
    const whole = { low: -45, high: 45, step: 2, decimals: 0 };
    assert.equal(stepValue(10, 1, whole, true), 11);
    assert.equal(stepValue(1.5, 1, range), 1.5);
    assert.equal(stepValue(0.5, -1, range), 0.5);
});

test('the narrowed ranges are the ones agreed for the panel', () => {
    assert.deepEqual([INTENSITY_MIN, INTENSITY_MAX], [0.5, 1.5]);
    const span = defs => Object.fromEntries(defs.map(({ key, min, max }) => [key, [min, max]]));
    assert.deepEqual(span(GLOW_LOOK_DEFS), { outerStrength: [0, 4], distance: [4, 16], quality: [0.1, 0.5] });
    assert.deepEqual(span(LAYOUT_DEFS), { gap: [0, 40], margin: [0, 40], cornerRadius: [0, 30], zoom: [0.9, 1.3], spread: [0.7, 1.3] });
    assert.deepEqual(span(FILTER_DEFS), {
        brightness: [-30, 30], contrast: [0.5, 1.5], saturation: [0, 1.6], hue: [-45, 45], temperature: [-40, 40],
    });
});

test('stored glow and color values from the wider ranges load clamped, not reset', () => {
    assert.deepEqual(clampGlowLook({ outerStrength: 6, distance: 20, quality: 0.5, colorMode: 'white' }),
        { outerStrength: 4, distance: 16, quality: 0.5, colorMode: 'white' });
    const restored = restoreColorFilter({ global: { hue: 90, temperature: -60, saturation: 2 } });
    assert.deepEqual([restored.global.hue, restored.global.temperature, restored.global.saturation], [45, -40, 1.6]);
});
