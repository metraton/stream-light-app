// Checks the GPU-free parts of the effect registry: the curves the shaders
// mirror, the beat helpers, every custom fragment's precision line, and every
// effect's defaults against its own panel controls.
// Run: node --test tests/test_effects_registry.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    EFFECTS, effectById, ASCII_RAMP, LUMA_WEIGHTS, asciiLevel, glyphIndex, xrayNegative,
    beatEnvelope, runsOnBeat, PIXEL_BAR_STEPS, pixelBarSize, THERMAL_STOPS, thermalColor, posterize,
} from '../js/effects-registry.js';
import { restoreEffectStack } from '../js/effect-stack.js';

const REGISTRY_SOURCE = readFileSync(new URL('../js/effects-registry.js', import.meta.url), 'utf8');

test('every custom fragment shader declares highp float first, after an optional #version line', () => {
    const fragments = [...REGISTRY_SOURCE.matchAll(/const (\w+_FRAGMENT) = `([^`]*)`/g)];
    assert.deepEqual(fragments.map(([, name]) => name).sort(),
        ['ASCII_FRAGMENT', 'NEON_FRAGMENT', 'POSTERIZE_FRAGMENT', 'THERMAL_FRAGMENT', 'XRAY_FRAGMENT']);
    for (const [, name, source] of fragments) {
        const body = source.replace(/^#version[^\n]*\n/, '');
        assert.ok(body.startsWith('precision highp float;'), `${name} does not open with precision highp float;`);
    }
});

test('the beat envelope spikes to 1 on the beat and decays monotonically to 0 by the next', () => {
    assert.equal(beatEnvelope(0), 1);
    assert.equal(beatEnvelope(1), 0);
    let previous = 2;
    for (let phase = 0; phase <= 1; phase += 0.05) {
        const value = beatEnvelope(phase);
        assert.ok(value <= previous && value >= 0);
        previous = value;
    }
    assert.ok(beatEnvelope(0.25) < 0.5, 'decay too slow to read as a hit');
    assert.equal(beatEnvelope(-0.1), 1);
    assert.equal(beatEnvelope(1.3), 0);
});

test('only an effect with tick() and a non-fixed sync runs on the beat', () => {
    const split = effectById('rgbsplit');
    assert.equal(runsOnBeat(split, split.defaults), false);
    assert.equal(runsOnBeat(split, { ...split.defaults, sync: 'beat' }), true);
    assert.equal(runsOnBeat(effectById('ascii'), { sync: 'beat' }), false);
    for (const effect of EFFECTS) {
        const sync = effect.params.find(p => p.key === 'sync');
        assert.equal(Boolean(effect.tick), Boolean(sync), `${effect.id}: tick() and a sync option go together`);
        if (sync) assert.equal(effect.defaults.sync, 'fixed', `${effect.id} must default to Fijo`);
    }
});

test('Pixelado por compás holds one size per 4-beat bar and loops through the steps', () => {
    for (let beat = 0; beat < 4; beat++) assert.equal(pixelBarSize(10, beat), 10 * PIXEL_BAR_STEPS[0]);
    assert.equal(pixelBarSize(10, 4), 10 * PIXEL_BAR_STEPS[1]);
    const loop = PIXEL_BAR_STEPS.length * 4;
    for (let beat = 0; beat < loop; beat++) assert.equal(pixelBarSize(10, beat), pixelBarSize(10, beat + loop));
    assert.ok(new Set(PIXEL_BAR_STEPS).size > 1, 'the size never changes');
});

const near = (actual, expected) => actual.every((v, i) => Math.abs(v - expected[i]) < 1e-9);

test('the thermal ramp runs black, blue, magenta, red, yellow, white at evenly spaced luminance', () => {
    assert.deepEqual(THERMAL_STOPS, [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]);
    const segments = THERMAL_STOPS.length - 1;
    THERMAL_STOPS.forEach((stop, i) => assert.ok(near(thermalColor(i / segments), stop), `stop ${i}`));
});

test('the thermal ramp blends linearly between stops and clamps luminance outside 0-1', () => {
    assert.ok(near(thermalColor(0.3), [0.5, 0, 1]), 'halfway blue to magenta');
    assert.ok(near(thermalColor(0.7), [1, 0.5, 0]), 'halfway red to yellow');
    assert.ok(near(thermalColor(-0.5), [0, 0, 0]));
    assert.ok(near(thermalColor(1.5), [1, 1, 1]));
});

test('posterize snaps 0-1 onto exactly `levels` values and keeps black and white', () => {
    for (let levels = 2; levels <= 8; levels++) {
        const seen = new Set();
        for (let value = 0; value <= 1; value += 0.001) seen.add(posterize(value, levels));
        assert.equal(seen.size, levels, `levels ${levels}`);
        assert.equal(posterize(0, levels), 0);
        assert.equal(posterize(1, levels), 1);
    }
    assert.equal(posterize(0.49, 2), 0);
    assert.equal(posterize(0.51, 2), 1);
    assert.equal(posterize(-1, 4), 0);
    assert.equal(posterize(2, 4), 1);
});

test('Posterizado levels run 2-8 and Contorno neón offers Columna or Blanco', () => {
    const levels = effectById('posterize').params.find(p => p.key === 'levels');
    assert.deepEqual([levels.min, levels.max, levels.decimals], [2, 8, 0]);
    const color = effectById('neon').params.find(p => p.key === 'color');
    assert.deepEqual(color.options.map(o => o.value), ['column', 'white']);
});

test('Pixelado por compás never drops below a 2px block, even before beat 0', () => {
    assert.ok(pixelBarSize(effectById('pixelate').params[0].min, 0) >= 2);
    assert.ok(Number.isInteger(pixelBarSize(7, -3)) && pixelBarSize(7, -3) >= 2);
});

const GLYPHS = ASCII_RAMP.length;
const DEFAULT_GAIN = effectById('ascii').defaults.gain;
const XRAY = effectById('xray').defaults;

test('at exposure and contrast 1 the X-ray negative is the plain inverse', () => {
    for (const value of [0, 0.2, 0.5, 0.9, 1]) assert.ok(Math.abs(xrayNegative(value, 1, 1) - (1 - value)) < 1e-12);
});

test('the X-ray negative falls monotonically and stays within 0-1', () => {
    let previous = 2;
    for (let value = -0.2; value <= 1.2; value += 0.01) {
        const tone = xrayNegative(value, XRAY.exposure, XRAY.contrast);
        assert.ok(tone <= previous && tone >= 0 && tone <= 1);
        previous = tone;
    }
});

test('at the defaults a dark room inverts across the full tonal range, not to a pale frame', () => {
    // Webcam luma in a dim room sits around 0.05-0.35; a plain inverse maps it to 0.65-0.95.
    assert.ok(xrayNegative(0.05, XRAY.exposure, XRAY.contrast) > 0.85);
    assert.ok(xrayNegative(0.35, XRAY.exposure, XRAY.contrast) < 0.1);
    assert.ok(xrayNegative(0.2, XRAY.exposure, XRAY.contrast) < 1 - 0.2);
});

test('Rayos X offers Ninguno, Cian and Columna tints and defaults to an untinted negative with no edge glow', () => {
    const tint = effectById('xray').params.find(p => p.key === 'tint');
    assert.deepEqual(tint.options.map(o => o.value), ['none', 'cyan', 'column']);
    assert.equal(XRAY.tint, 'none');
    assert.equal(XRAY.edge, 0);
});

test('a Rayos X entry saved before exposure and contrast existed restores with their defaults', () => {
    const model = restoreEffectStack({ global: [{ id: 'xray', params: { edge: 1.2, tint: 'cyan' } }] });
    assert.deepEqual(model.global[0].params, { exposure: XRAY.exposure, contrast: XRAY.contrast, edge: 1.2, tint: 'cyan' });
});

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
