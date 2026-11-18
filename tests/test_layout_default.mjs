// Checks the Layout default: saving, loading, validation of stored data and the
// factory fallback, plus Reset to Defaults using it. No browser: storage is a Map.
// Run: node --test tests/test_layout_default.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import {
    LAYOUT_DEFAULT_KEY, factoryLayout, validateLayout, clampLayoutFields, loadUserLayout,
    saveUserLayout, clearUserLayout, activeLayoutDefault,
} from '../js/layout-default.js';
import { resetToDefaults, loadPreset } from '../js/panel/preset-manager.js';

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
    };
}

const FACTORY = { gap: 20, margin: 20, cornerRadius: 15, zoom: 1, spread: 1 };
const MINE = { gap: 8, margin: 34, cornerRadius: 22, zoom: 1.25, spread: 0.8 };

test('the factory layout is the config.js layout fields and nothing else', () => {
    assert.deepEqual(factoryLayout(), FACTORY);
});

test('without a saved default the active default is the factory one', () => {
    const storage = memoryStorage();
    assert.equal(loadUserLayout(storage), null);
    assert.deepEqual(activeLayoutDefault(storage), FACTORY);
});

test('a saved default round-trips and leaves rotation, count and other fields out', () => {
    const storage = memoryStorage();
    saveUserLayout({ ...MINE, rotationSteps: 1, count: 5 }, storage);
    assert.deepEqual(JSON.parse(storage.getItem(LAYOUT_DEFAULT_KEY)), MINE);
    assert.deepEqual(loadUserLayout(storage), MINE);
    assert.deepEqual(activeLayoutDefault(storage), MINE);
});

test('non-numeric stored fields fall back to factory values and out-of-range ones are clamped', () => {
    const stored = {
        gap: 'x', margin: -5, cornerRadius: 12, zoom: null, spread: 9,
        rotationSteps: 2, fps: 30, extra: 'y',
    };
    const storage = memoryStorage({ [LAYOUT_DEFAULT_KEY]: JSON.stringify(stored) });
    assert.deepEqual(loadUserLayout(storage), { ...FACTORY, margin: 0, cornerRadius: 12, spread: 1.3 });
    assert.deepEqual(validateLayout({}), FACTORY);
});

test('a preset saved under the wider ranges loads its layout clamped to the narrowed sliders', () => {
    const before = { ...CONFIG.columns };
    const storage = new Map([['streamlight-preset-wide', JSON.stringify({ columns: { margin: 60, zoom: 1.5, spread: 0.5, gap: 12 } })]]);
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null };
    try {
        assert.ok(loadPreset('wide', { importTweaks() {}, importBase() {} }));
        assert.deepEqual(
            { gap: CONFIG.columns.gap, margin: CONFIG.columns.margin, zoom: CONFIG.columns.zoom, spread: CONFIG.columns.spread },
            { gap: 12, margin: 40, zoom: 1.3, spread: 0.7 },
        );
        assert.deepEqual(clampLayoutFields({ margin: 'x', zoom: 0.8 }), { zoom: 0.9 });
    } finally {
        delete globalThis.localStorage;
        Object.assign(CONFIG.columns, before);
    }
});

test('stored text that is not a JSON object counts as no saved default', () => {
    for (const text of ['{not json', '[1,2]', '"gap"', '42', 'null']) {
        const storage = memoryStorage({ [LAYOUT_DEFAULT_KEY]: text });
        assert.equal(loadUserLayout(storage), null, text);
        assert.deepEqual(activeLayoutDefault(storage), FACTORY, text);
    }
});

test('clearing the saved default returns to factory', () => {
    const storage = memoryStorage();
    saveUserLayout(MINE, storage);
    clearUserLayout(storage);
    assert.equal(loadUserLayout(storage), null);
    assert.deepEqual(activeLayoutDefault(storage), FACTORY);
});

test('Reset to Defaults restores the user layout default and keeps the rotation', () => {
    const storage = memoryStorage();
    saveUserLayout(MINE, storage);
    Object.assign(CONFIG.columns, { gap: 0, zoom: 1.5, rotationSteps: 1 });
    const app = { resetTweaks() {}, importBase() {} };

    resetToDefaults(app, storage);
    assert.deepEqual(
        { gap: CONFIG.columns.gap, margin: CONFIG.columns.margin, cornerRadius: CONFIG.columns.cornerRadius,
            zoom: CONFIG.columns.zoom, spread: CONFIG.columns.spread },
        MINE,
    );
    assert.equal(CONFIG.columns.rotationSteps, 1);

    clearUserLayout(storage);
    resetToDefaults(app, storage);
    assert.equal(CONFIG.columns.gap, FACTORY.gap);
    assert.equal(CONFIG.columns.rotationSteps, 1);
});
