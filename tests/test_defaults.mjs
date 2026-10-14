// Checks that the tuned values in code are the one base: DEFAULTS is CONFIG as
// loaded, Reset to Defaults returns to it, the Original color set is it, and a
// preset from before freeze/timeDelay were removed still loads.
// Run: node --test tests/test_defaults.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, DEFAULTS } from '../js/config.js';
import { BUILTIN_SETS, hexFromInt } from '../js/color-sets.js';
import { BASE_STATE, MOODS, MOOD_QUICK } from '../js/mood-map.js';
import { StreamLightApp } from '../js/app.js';
import { resetToDefaults, loadPreset } from '../js/panel/preset-manager.js';

const BASE_FIELDS = ['colors', 'columns', 'colorFilter', 'effectStack', 'glow', 'text'];

function baseOf(config) {
    return structuredClone(Object.fromEntries(BASE_FIELDS.map(key => [key, config[key]])));
}

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
    };
}

const LOADED = baseOf(CONFIG);

test('DEFAULTS holds exactly the base fields of CONFIG as loaded', () => {
    assert.deepEqual(Object.keys(DEFAULTS).sort(), [...BASE_FIELDS].sort());
    assert.deepEqual(baseOf(DEFAULTS), LOADED);
    assert.deepEqual(CONFIG.screenEffects, []);
});

test('the tuned base values', () => {
    assert.deepEqual(LOADED.columns, {
        count: 5, gap: 20, margin: 20, cornerRadius: 15, rotationSteps: 3, zoom: 1, spread: 1,
    });
    assert.deepEqual(LOADED.glow, {
        distance: 8, outerStrength: 2, innerStrength: 0, quality: 0.5,
        colorMode: 'column', customColor: 0xffffff, intensity: 0,
    });
    assert.equal(BASE_STATE.bpm, 120);
    assert.deepEqual(MOOD_QUICK.map(({ mood }) => mood), Object.keys(MOODS));
    assert.deepEqual(MOODS.calm, {
        colors: [1], pattern: 'none', movement: 'wave', glow: 'breathe', bpm: 80,
        rates: { color: 1, movement: 1, glow: 0.5 },
    });
    assert.deepEqual(MOODS.groove, {
        colors: [1, 3], pattern: 'carousel', movement: 'wave', glow: 'pulse', bpm: 120,
        rates: { color: 1, movement: 1, glow: 1 },
    });
});

test('the Original color set is the default colors', () => {
    const original = BUILTIN_SETS.find(set => set.name === 'Original');
    assert.deepEqual(original.colors, CONFIG.colorOrder.map(name => hexFromInt(DEFAULTS.colors[name])));
});

test('Reset to Defaults with no saved layout returns every base field to the loaded values', () => {
    const rotationSteps = CONFIG.columns.rotationSteps;
    Object.assign(CONFIG.colors, { YELLOW: 0x123456 });
    Object.assign(CONFIG.columns, { gap: 3, margin: 50, zoom: 1.4 });
    Object.assign(CONFIG.glow, { distance: 19, outerStrength: 6, quality: 0.1 });
    CONFIG.text.size = DEFAULTS.text.size + 10;
    const app = new StreamLightApp();
    app._setTweak('movement', 'wave', 'rate', 4);

    resetToDefaults(app, memoryStorage());
    assert.deepEqual(baseOf(CONFIG), { ...LOADED, columns: { ...LOADED.columns, rotationSteps } });
    assert.deepEqual(app.tweaks, { movement: {}, glow: {} });
});

test('a preset with tweaks for removed movements loads and keeps only existing effects', () => {
    const preset = {
        glow: { ...DEFAULTS.glow },
        tweaks: {
            movement: { freeze: { rate: 2 }, timeDelay: { rate: 1, easing: 'linear' }, wave: { rate: 2 } },
            glow: { gone: { rate: 2 } },
        },
    };
    const storage = memoryStorage({ 'streamlight-preset-old': JSON.stringify(preset) });
    globalThis.localStorage = storage;
    try {
        const app = new StreamLightApp();
        assert.equal(loadPreset('old', app), true);
        assert.deepEqual(app.tweaks, { movement: { wave: { rate: 2 } }, glow: {} });
    } finally {
        delete globalThis.localStorage;
    }
});
