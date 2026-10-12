// Checks the Layout default: saving, loading, validation of stored data and the
// factory fallback, plus Reset to Defaults using it. No browser: storage is a Map.
// Run: node --test tests/test_layout_default.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import {
    LAYOUT_DEFAULT_KEY, factoryLayout, validateLayout, loadUserLayout,
    saveUserLayout, clearUserLayout, activeLayoutDefault,
} from '../js/layout-default.js';
import { resetToDefaults } from '../js/panel/preset-manager.js';

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

test('invalid or unknown stored fields fall back to factory values field by field', () => {
    const stored = {
        gap: 'x', margin: -5, cornerRadius: 12, zoom: null, spread: 9,
        rotationSteps: 2, fps: 30, extra: 'y',
    };
    const storage = memoryStorage({ [LAYOUT_DEFAULT_KEY]: JSON.stringify(stored) });
    assert.deepEqual(loadUserLayout(storage), { ...FACTORY, cornerRadius: 12 });
    assert.deepEqual(validateLayout({}), FACTORY);
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
    const app = { resetTweaks() {} };

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
