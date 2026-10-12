// Checks the GPU-free parts of the effect registry: the ASCII ramp mapping,
// the luminance gain curve the shader mirrors, and every effect's defaults
// against its own panel controls.
// Run: node --test tests/test_effects_registry.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, effectById, ASCII_RAMP, LUMA_WEIGHTS, asciiLevel, glyphIndex } from '../js/effects-registry.js';
import { restoreEffectStack } from '../js/effect-stack.js';

const GLYPHS = ASCII_RAMP.length;
const DEFAULT_GAIN = effectById('ascii').defaults.gain;

test('the ramp runs from an empty cell to distinct denser glyphs', () => {
    assert.equal(ASCII_RAMP[0], ' ');
    assert.equal(new Set(ASCII_RAMP).size, GLYPHS);
});

test('luma weights are Rec. 601 and sum to one, so white levels to 1', () => {
    assert.deepEqual(LUMA_WEIGHTS, [0.299, 0.587, 0.114]);
    assert.ok(Math.abs(LUMA_WEIGHTS.reduce((a, b) => a + b) - 1) < 1e-9);
});

test('the gain curve keeps black and white fixed and is the identity at gain 1', () => {
    for (const gain of [1, DEFAULT_GAIN, 6]) {
        assert.equal(asciiLevel(0, gain), 0);
        assert.equal(asciiLevel(1, gain), 1);
    }
    for (const luma of [0.1, 0.37, 0.8]) assert.ok(Math.abs(asciiLevel(luma, 1) - luma) < 1e-12);
});

test('the gain curve is monotonic and clamps luminance outside 0-1', () => {
    let previous = -1;
    for (let luma = 0; luma <= 1; luma += 0.01) {
        const level = asciiLevel(luma, DEFAULT_GAIN);
        assert.ok(level >= previous);
        previous = level;
    }
    assert.equal(asciiLevel(-0.2, DEFAULT_GAIN), 0);
    assert.equal(asciiLevel(1.4, DEFAULT_GAIN), 1);
});

test('at the default gain a dark room spans the ramp instead of collapsing onto dots', () => {
    // Webcam luma in a dim room sits around 0.05-0.35.
    const used = new Set();
    for (let luma = 0.05; luma <= 0.35; luma += 0.01) used.add(glyphIndex(asciiLevel(luma, DEFAULT_GAIN), GLYPHS));
    assert.ok(used.size >= GLYPHS / 2, `only ${used.size} glyphs used`);
    assert.ok(glyphIndex(asciiLevel(0.35, DEFAULT_GAIN), GLYPHS) > glyphIndex(0.35, GLYPHS));
});

test('every glyph is reachable and full white picks the densest one', () => {
    for (let i = 0; i < GLYPHS; i++) assert.equal(glyphIndex((i + 0.5) / GLYPHS, GLYPHS), i);
    assert.equal(glyphIndex(0, GLYPHS), 0);
    assert.equal(glyphIndex(1, GLYPHS), GLYPHS - 1);
});

test('every effect default lies within its slider range or among its options', () => {
    for (const effect of EFFECTS) {
        for (const param of effect.params) {
            const value = effect.defaults[param.key];
            if (param.options) {
                assert.ok(param.options.some(option => option.value === value), `${effect.id}.${param.key}`);
            } else {
                assert.ok(value >= param.min && value <= param.max, `${effect.id}.${param.key}=${value}`);
            }
        }
        assert.deepEqual(Object.keys(effect.defaults).sort(), effect.params.map(p => p.key).sort());
    }
});

test('ASCII offers Columna, Blanco and Original colors', () => {
    const color = effectById('ascii').params.find(p => p.key === 'color');
    assert.deepEqual(color.options.map(o => o.value), ['column', 'white', 'original']);
});

test('an ASCII entry saved before gain and dim existed restores with their defaults', () => {
    const model = restoreEffectStack({ global: [{ id: 'ascii', params: { size: 10, color: 'white' } }] });
    const { defaults } = effectById('ascii');
    assert.deepEqual(model.global[0].params, { size: 10, gain: defaults.gain, dim: defaults.dim, color: 'white' });
});
