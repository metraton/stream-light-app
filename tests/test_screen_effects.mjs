// Checks the GPU-free parts of the Pantalla effects: every default against its
// own controls, every custom fragment's precision line, the pure helpers the
// shaders and ticks rely on, the list's fixed order, and presets saving it.
// Run: node --test tests/test_screen_effects.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    SCREEN_EFFECTS, screenEffectById, flashEnvelope, foldAngle, kaleidoRotation,
} from '../js/screen-effects.js';
import { toggleScreenEffect, restoreScreenStack, resetScreenStack } from '../js/screen-stack.js';
import { runsOnBeat } from '../js/effects-registry.js';
import { CONFIG } from '../js/config.js';
import { savePreset, loadPreset } from '../js/panel/preset-manager.js';

const SOURCE = readFileSync(new URL('../js/screen-effects.js', import.meta.url), 'utf8');
const TAU = 2 * Math.PI;
const close = (actual, expected) => Math.abs(actual - expected) < 1e-9;

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key),
    },
});
const app = { exportTweaks: () => ({}), importTweaks() {} };

test('every screen effect default lies within its slider range or among its options', () => {
    for (const effect of SCREEN_EFFECTS) {
        for (const param of effect.params) {
            const value = effect.defaults[param.key];
            if (param.options) {
                assert.ok(param.options.some(option => option.value === value), `${effect.id}.${param.key}`);
                assert.equal(new Set(param.options.map(o => o.value)).size, param.options.length, `${effect.id}.${param.key} repeats a value`);
            } else {
                assert.ok(value >= param.min && value <= param.max, `${effect.id}.${param.key}=${value}`);
            }
        }
        assert.deepEqual(Object.keys(effect.defaults).sort(), effect.params.map(p => p.key).sort());
    }
    assert.equal(new Set(SCREEN_EFFECTS.map(e => e.id)).size, SCREEN_EFFECTS.length, 'repeated id');
});

test('every custom screen fragment shader opens with precision highp float;', () => {
    const fragments = [...SOURCE.matchAll(/const (\w+_FRAGMENT) = `([^`]*)`/g)];
    assert.deepEqual(fragments.map(([, name]) => name).sort(), ['FLASH_FRAGMENT', 'MIRROR_FRAGMENT']);
    for (const [, name, source] of fragments) {
        assert.ok(source.startsWith('precision highp float;'), `${name} does not open with precision highp float;`);
    }
});

test('the flash is full on the beat, gone after its duration and decays in between', () => {
    assert.equal(flashEnvelope(0, 1, 0.25), 1);
    assert.equal(flashEnvelope(7, 1, 0.25), 1);
    assert.equal(flashEnvelope(0.25, 1, 0.25), 0);
    assert.equal(flashEnvelope(0.6, 1, 0.25), 0);
    let previous = 2;
    for (let beat = 0; beat < 0.25; beat += 0.01) {
        const value = flashEnvelope(beat, 1, 0.25);
        assert.ok(value < previous && value > 0);
        previous = value;
    }
});

test('Ritmo 1/2 and 1/4 flash two and four times per beat, and a long duration is cut to the gap', () => {
    for (const beat of [0, 0.5, 1, 1.5]) assert.equal(flashEnvelope(beat, 2, 0.1), 1);
    assert.equal(flashEnvelope(0.25, 2, 0.1), 0);
    for (const beat of [0, 0.25, 0.5, 0.75]) assert.equal(flashEnvelope(beat, 4, 1), 1);
    assert.ok(flashEnvelope(0.24, 4, 1) < 0.01, 'a flash must have faded before the next one');
    assert.equal(flashEnvelope(-1, 1, 0.25), 1);
});

test('the flash ticks every frame; Espejo costs nothing per frame at its defaults', () => {
    const tickers = SCREEN_EFFECTS.filter(effect => runsOnBeat(effect, effect.defaults)).map(e => e.id);
    assert.ok(tickers.includes('flash'));
    assert.ok(!tickers.includes('mirror'));
});

test('folding puts every angle in half a wedge, mirrors neighbours and repeats every wedge', () => {
    for (let segments = 3; segments <= 12; segments++) {
        const segment = TAU / segments;
        for (let angle = -10; angle <= 10; angle += 0.37) {
            const folded = foldAngle(angle, segments);
            assert.ok(folded >= 0 && folded <= segment / 2 + 1e-12, `${segments}: ${angle} -> ${folded}`);
            assert.ok(close(folded, foldAngle(-angle, segments)), 'neighbouring wedges are reflections');
            assert.ok(close(folded, foldAngle(angle + segment, segments)), 'every wedge repeats');
        }
        assert.equal(foldAngle(0, segments), 0);
        assert.ok(close(foldAngle(segment / 2, segments), segment / 2));
    }
});

test('the kaleidoscope turns `spin` turns per bar, and al golpe meets each beat without a jump', () => {
    assert.ok(close(kaleidoRotation(0.5, 4, 0, 'smooth'), 0.5 * TAU));
    assert.ok(close(kaleidoRotation(0.5, 4, 0, 'beat'), 0.5 * TAU));
    for (let beat = 0; beat < 8; beat++) {
        assert.ok(Math.abs(kaleidoRotation(0.3, beat, 0.9999, 'beat') - kaleidoRotation(0.3, beat + 1, 0, 'beat')) < 1e-6);
    }
    assert.ok(kaleidoRotation(1, 0, 0.25, 'beat') > kaleidoRotation(1, 0, 0.25, 'smooth'), 'al golpe turns fast early in the beat');
});

test('Espejo offers Espejo H, Espejo V and Caleido with 3-12 segments', () => {
    const { params } = screenEffectById('mirror');
    assert.deepEqual(params.find(p => p.key === 'mode').options.map(o => o.value), ['horizontal', 'vertical', 'kaleido']);
    const segments = params.find(p => p.key === 'segments');
    assert.deepEqual([segments.min, segments.max, segments.decimals], [3, 12, 0]);
});

test('effects run in registry order whatever order they are turned on in', () => {
    const list = [];
    for (const { id } of [...SCREEN_EFFECTS].reverse()) toggleScreenEffect(list, id);
    assert.deepEqual(list.map(e => e.id), SCREEN_EFFECTS.map(e => e.id));
    toggleScreenEffect(list, SCREEN_EFFECTS[0].id);
    assert.deepEqual(list.map(e => e.id), SCREEN_EFFECTS.slice(1).map(e => e.id));
    assert.throws(() => toggleScreenEffect(list, 'nope'));
});

test('restoring drops unknown and repeated effects, checks params and treats non-lists as none', () => {
    const restored = restoreScreenStack([
        { id: 'nope', params: {} },
        { id: 'flash', params: { mode: 'negative', rate: 3, duration: 9 } },
        { id: 'flash', params: { mode: 'black' } },
    ]);
    const { defaults } = screenEffectById('flash');
    assert.deepEqual(restored, [{ id: 'flash', params: { mode: 'negative', rate: defaults.rate, duration: 1 } }]);
    assert.deepEqual(restoreScreenStack(undefined), []);
    assert.deepEqual(restoreScreenStack({ flash: true }), []);
});

test('a preset saves the Pantalla effects and loads them back into the same list', () => {
    const list = CONFIG.screenEffects;
    resetScreenStack(list);
    for (const { id } of SCREEN_EFFECTS) toggleScreenEffect(list, id);
    list[0].params = { ...list[0].params, ...{ mode: 'negative', rate: 4, duration: 0.5 } };
    const saved = structuredClone(list);
    savePreset('round-trip', app);
    resetScreenStack(list);
    assert.equal(loadPreset('round-trip', app), true);
    assert.equal(CONFIG.screenEffects, list, 'the screen layer holds this array; it must not be replaced');
    assert.deepEqual(list, saved);
});

test('a preset saved with the removed Estelas loads with the rest of its effects and without it', () => {
    resetScreenStack(CONFIG.screenEffects);
    const screenEffects = [
        { id: 'flash', params: { ...screenEffectById('flash').defaults } },
        { id: 'trails', params: { persistence: 0.8, sync: 'fixed' } },
        { id: 'mirror', params: { ...screenEffectById('mirror').defaults } },
    ];
    storage.set('streamlight-preset-with-trails', JSON.stringify({ colors: { ...CONFIG.colors }, screenEffects }));
    assert.equal(loadPreset('with-trails', app), true);
    assert.deepEqual(CONFIG.screenEffects.map(e => e.id), ['flash', 'mirror']);
});

test('a preset from before Pantalla loads with no screen effect on', () => {
    resetScreenStack(CONFIG.screenEffects);
    toggleScreenEffect(CONFIG.screenEffects, 'flash');
    storage.set('streamlight-preset-old', JSON.stringify({ colors: { ...CONFIG.colors } }));
    assert.equal(loadPreset('old', app), true);
    assert.deepEqual(CONFIG.screenEffects, []);
});
