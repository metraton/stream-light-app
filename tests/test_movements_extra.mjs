// Checks Golpe de zoom (key J) and the removed movements without a browser.
// Run: node --test tests/test_movements_extra.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EffectEngine } from '../js/effect-engine.js';
import { EFFECTS } from '../js/effects.js';

const COLUMN_COUNT = 5;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** An engine playing `name` from beat 0 with its defaults, overridden by `settings`. */
function playing(name, settings = {}) {
    const def = EFFECTS[name];
    const engine = new EffectEngine();
    engine.play(name, def, { rate: def.rate, easing: def.easing, intensity: 1, ...settings }, 0);
    return engine;
}

test('the movements are the six keyed ones and Golpe de zoom; Congelado and Desfase are gone', () => {
    assert.deepEqual(Object.keys(EFFECTS).sort(), ['broken', 'equalizer', 'expand', 'shake', 'wave', 'zoomPulse']);
    assert.equal(EFFECTS.freeze, undefined);
    assert.equal(EFFECTS.timeDelay, undefined);
    for (const def of Object.values(EFFECTS)) {
        assert.equal(def.extra, undefined, `${def.label} is keyed, not a panel-only extra`);
        assert.equal(def.options, undefined, `${def.label} has no option row`);
    }
    const result = playing('wave').compute(COLUMN_COUNT, 1, 0.5);
    assert.deepEqual(Object.keys(result).sort(), ['offsetX', 'offsetY', 'scale', 'scaleY']);
});

test('golpe de zoom punches to its full amount on every step and decays before the next', () => {
    const amount = EFFECTS.zoomPulse.phases.PUNCH;
    assert.ok(amount >= 0.035 && amount <= 0.04, 'a few percent, in the Equalizer family');
    const engine = playing('zoomPulse');
    const at = beat => engine.compute(COLUMN_COUNT, 1, beat).scale;
    for (const beat of [0, 1, 2, 7]) assert.ok(at(beat).every(v => close(v, amount)), `punch at beat ${beat}`);
    let previous = Infinity;
    for (let t = 0; t < 1; t += 1 / 32) {
        const [value] = at(3 + t);
        assert.ok(value <= previous + 1e-12, `still decaying ${t} into the step`);
        previous = value;
    }
    assert.ok(at(3 + 1 / 3)[0] < amount * 0.1, 'most of the punch is gone a third into the step');
    assert.ok(at(3.999)[0] < amount * 0.01, 'at rest before the next step');
    const { offsetX, offsetY, scaleY } = engine.compute(COLUMN_COUNT, 1, 0.1);
    assert.ok([...offsetX, ...offsetY, ...scaleY].every(v => v === 0), 'the zoom moves nothing else');
});

test('golpe de zoom follows intensity, the rate buttons and the easing buttons', async () => {
    const amount = EFFECTS.zoomPulse.phases.PUNCH;
    assert.ok(close(playing('zoomPulse', { intensity: 2 }).compute(COLUMN_COUNT, 1, 0).scale[0], 2 * amount));
    assert.ok(close(playing('zoomPulse', { rate: 2 }).compute(COLUMN_COUNT, 1, 0.5).scale[0], amount), 'rate 2 punches on the half beat');
    assert.ok(close(playing('zoomPulse', { easing: 'linear' }).compute(COLUMN_COUNT, 1, 0.25).scale[0], amount * 0.75));

    const { EASING_MODES, sameCurve } = await import('../js/panel/layer-controls.js');
    const shown = EASING_MODES.find(mode => sameCurve(mode.curve, EFFECTS.zoomPulse.easing));
    assert.equal(shown?.label, 'Destello', 'the default easing lights a panel button');
});
