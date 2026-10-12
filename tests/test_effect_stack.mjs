// Checks the per-color effect stack: turning effects on and off, "Todos" plus
// per-color resolution, persisted data and old presets. No Pixi: the effect
// definitions here are stand-ins with the registry's shape.
// Run: node --test tests/test_effect_stack.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createEffectStack, hasEffect, addEffect, removeEffect, toggleEffect, setEffectParam,
    clearEffects, resetEffectStack, resolveEffects, chainKey, restoreEffectStack,
} from '../js/effect-stack.js';
import { CONFIG } from '../js/config.js';
import { loadPreset } from '../js/panel/preset-manager.js';

const DEFS = [
    {
        id: 'dots', label: 'Dots', defaults: { size: 10, mode: 'color' },
        params: [
            { key: 'size', label: 'Size', min: 4, max: 32, decimals: 0 },
            { key: 'mode', label: 'Mode', options: [{ value: 'color', label: 'Color' }, { value: 'white', label: 'White' }] },
        ],
    },
    {
        id: 'glass', label: 'Glass', defaults: { edge: 1 },
        params: [{ key: 'edge', label: 'Edge', min: 0, max: 3, decimals: 2 }],
    },
];
const ALL = null;
const UNCOLORED = -1;

test('a new stack has no effect for any color or for uncolored columns', () => {
    const model = createEffectStack();
    for (const slot of [UNCOLORED, 0, 1, 2, 3, 4]) assert.deepEqual(resolveEffects(model, slot), []);
    assert.equal(chainKey(resolveEffects(model, 0)), '');
});

test('adding turns an effect on with its defaults once; removing turns it off', () => {
    const model = createEffectStack();
    addEffect(model, 0, 'dots', DEFS);
    addEffect(model, 0, 'dots', DEFS);
    assert.deepEqual(model.slots[0], [{ id: 'dots', params: { size: 10, mode: 'color' } }]);
    assert.notEqual(model.slots[0][0].params, DEFS[0].defaults, 'params are a copy of the defaults');
    assert.ok(!hasEffect(model, 1, 'dots') && !hasEffect(model, ALL, 'dots'));

    removeEffect(model, 0, 'dots');
    assert.ok(!hasEffect(model, 0, 'dots'));
    removeEffect(model, 0, 'dots');
    assert.throws(() => addEffect(model, 0, 'nope', DEFS), /Unknown effect/);
});

test('toggling flips one effect and leaves the others in their order', () => {
    const model = createEffectStack();
    toggleEffect(model, 2, 'dots', DEFS);
    toggleEffect(model, 2, 'glass', DEFS);
    assert.equal(chainKey(resolveEffects(model, 2)), 'dots+glass');
    toggleEffect(model, 2, 'dots', DEFS);
    assert.equal(chainKey(resolveEffects(model, 2)), 'glass');
    clearEffects(model, 2);
    assert.deepEqual(model.slots[2], []);
});

test('"Todos" applies to every color and uncolored columns; a color adds its own after it', () => {
    const model = createEffectStack();
    addEffect(model, ALL, 'glass', DEFS);
    addEffect(model, 0, 'dots', DEFS);
    assert.equal(chainKey(resolveEffects(model, 0)), 'glass+dots');
    for (const slot of [UNCOLORED, 1, 2, 3, 4]) assert.equal(chainKey(resolveEffects(model, slot)), 'glass');
});

test('a color entry for an effect "Todos" also has keeps the position and uses the color params', () => {
    const model = createEffectStack();
    addEffect(model, ALL, 'dots', DEFS);
    addEffect(model, ALL, 'glass', DEFS);
    addEffect(model, 3, 'dots', DEFS);
    setEffectParam(model, 3, 'dots', 'size', 20);
    const resolved = resolveEffects(model, 3);
    assert.equal(chainKey(resolved), 'dots+glass');
    assert.equal(resolved[0].params.size, 20);
    assert.equal(resolveEffects(model, 1)[0].params.size, 10);

    resolved[0].params.size = 5;
    assert.equal(model.slots[3][0].params.size, 20, 'resolved entries are copies');
});

test('effects follow the color slot, not the column showing it', () => {
    const model = createEffectStack();
    addEffect(model, 0, 'dots', DEFS);
    const columnColors = ['YELLOW', 'BLUE', 'RED'];
    const colorOrder = ['YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE'];
    const chainOfColumn = column => chainKey(resolveEffects(model, colorOrder.indexOf(columnColors[column])));
    assert.equal(chainOfColumn(0), 'dots');
    columnColors.reverse();
    assert.equal(chainOfColumn(0), '');
    assert.equal(chainOfColumn(2), 'dots');
});

test('reset clears "Todos" and every color in place', () => {
    const model = createEffectStack();
    addEffect(model, ALL, 'glass', DEFS);
    addEffect(model, 4, 'dots', DEFS);
    const slots = model.slots;
    resetEffectStack(model);
    assert.equal(model.slots, slots);
    for (const slot of [UNCOLORED, 0, 1, 2, 3, 4]) assert.deepEqual(resolveEffects(model, slot), []);
});

test('a saved stack survives the JSON round trip unchanged', () => {
    const model = createEffectStack();
    addEffect(model, ALL, 'glass', DEFS);
    addEffect(model, 0, 'dots', DEFS);
    setEffectParam(model, 0, 'dots', 'mode', 'white');
    setEffectParam(model, ALL, 'glass', 'edge', 2.5);
    const restored = restoreEffectStack(JSON.parse(JSON.stringify(model)), DEFS);
    assert.deepEqual(restored, model);
});

test('restoring drops unknown or repeated effects and repairs params', () => {
    const restored = restoreEffectStack({
        global: [{ id: 'gone' }, { id: 'glass', params: { edge: 9 } }, { id: 'glass' }],
        slots: [[{ id: 'dots', params: { size: 'x', mode: 'neon' } }], null],
    }, DEFS);
    assert.deepEqual(restored.global, [{ id: 'glass', params: { edge: 3 } }]);
    assert.deepEqual(restored.slots[0], [{ id: 'dots', params: { size: 10, mode: 'color' } }]);
    assert.equal(restored.slots.length, 5);
    assert.deepEqual(restored.slots[1], []);
});

test('a preset saved before effects existed loads with no effects', () => {
    CONFIG.effectStack.slots[0].push({ id: 'dots', params: { size: 10, mode: 'color' } });
    const storage = new Map([['streamlight-preset-old', JSON.stringify({ colors: {}, glow: {} })]]);
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null };
    const app = { importTweaks() {} };
    try {
        assert.ok(loadPreset('old', app));
    } finally {
        delete globalThis.localStorage;
    }
    for (const slot of [UNCOLORED, 0, 1, 2, 3, 4]) assert.deepEqual(resolveEffects(CONFIG.effectStack, slot), []);
});
