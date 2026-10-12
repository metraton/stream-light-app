// Checks the extra movements (panel buttons, no key) without a browser.
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

const live = () => new Array(COLUMN_COUNT).fill(null);

test('congelado por turnos freezes one column per step, walking the row, for the first `hold` of the step', async () => {
    const { frozenSteps } = await import('../js/effect-engine.js');
    for (let step = 0; step < 12; step++) {
        const turn = live();
        turn[step % COLUMN_COUNT] = step;
        assert.deepEqual(frozenSteps(step + 0.25, COLUMN_COUNT, 'turns', 0.5), turn, `step ${step}`);
        assert.deepEqual(frozenSteps(step + 0.75, COLUMN_COUNT, 'turns', 0.5), live(), `live after the hold, step ${step}`);
    }
});

test('congelado todas freezes every column on the same step, then all go live together', async () => {
    const { frozenSteps } = await import('../js/effect-engine.js');
    for (let step = 0; step < 6; step++) {
        assert.deepEqual(frozenSteps(step + 0.1, COLUMN_COUNT, 'all', 0.5), new Array(COLUMN_COUNT).fill(step));
        assert.deepEqual(frozenSteps(step + 0.5, COLUMN_COUNT, 'all', 0.5), live());
    }
    assert.deepEqual(frozenSteps(4.99, COLUMN_COUNT, 'all', 1), new Array(COLUMN_COUNT).fill(4), 'a full hold never goes live');
});

test('congelado in the engine: option, intensity as hold, and a freeze of 1/rate beats', () => {
    assert.equal(playing('freeze').active.option, 'turns', 'the first option is the default');
    assert.deepEqual(playing('freeze').compute(COLUMN_COUNT, 1, 3.4).frozen, [null, null, null, 3, null]);
    assert.deepEqual(playing('freeze').compute(COLUMN_COUNT, 1, 3.6).frozen, live(), 'HOLD 0.5 at intensity 1');
    assert.deepEqual(playing('freeze', { intensity: 2 }).compute(COLUMN_COUNT, 1, 3.9).frozen, [null, null, null, 3, null]);
    assert.deepEqual(playing('freeze', { option: 'all' }).compute(COLUMN_COUNT, 1, 2.2).frozen, new Array(COLUMN_COUNT).fill(2));
    const slow = playing('freeze', { rate: 0.25 });
    assert.deepEqual(slow.compute(COLUMN_COUNT, 1, 5.9).frozen, [null, 1, null, null, null], 'at rate 1/4 column 1 holds beats 4-6');
    assert.deepEqual(slow.compute(COLUMN_COUNT, 1, 6.1).frozen, live());
    const { offsetX, offsetY, scaleY, scale } = slow.compute(COLUMN_COUNT, 1, 5);
    assert.ok([...offsetX, ...offsetY, ...scaleY].every(v => v === 0) && scale === null, 'the freeze moves nothing');
});

test('desfase ranks grow left to right from a live column 0, or outward from a live center', async () => {
    const { delayRanks } = await import('../js/effect-engine.js');
    assert.deepEqual(delayRanks(5, 'ltr'), [0, 1, 2, 3, 4]);
    assert.deepEqual(delayRanks(5, 'center'), [2, 1, 0, 1, 2]);
});

test('desfase rings fit each column\'s deepest delay, never past MAX_RING_FRAMES, none for a live column', async () => {
    const { ringLengths, MAX_RING_FRAMES } = await import('../js/effect-engine.js');
    assert.equal(MAX_RING_FRAMES, 20);
    assert.deepEqual(ringLengths([0, 1, 2, 3, 4], 4), [0, 5, 9, 13, 17]);
    assert.deepEqual(ringLengths([2, 1, 0, 1, 2], 4), [9, 5, 0, 5, 9]);
    assert.deepEqual(ringLengths([0, 10], 4), [0, MAX_RING_FRAMES]);
});

test('desfase ring index math wraps around and never reads deeper than the ring or the frames written', async () => {
    const { ringReadSlot, ringWriteSlot } = await import('../js/effect-engine.js');
    for (const length of [1, 5, 17, 20]) {
        // writtenAt[slot] is the frame number last written to that slot.
        const writtenAt = [];
        for (let newest = 0; newest < 3 * length + 2; newest++) {
            writtenAt[ringWriteSlot(newest, length)] = newest;
            for (let delay = 0; delay < length + 3; delay++) {
                const expected = newest - Math.min(delay, newest, length - 1);
                assert.equal(writtenAt[ringReadSlot(newest, delay, length)], expected, `length ${length}, newest ${newest}, delay ${delay}`);
            }
        }
    }
});

test('desfase in the engine: a staircase that breathes with the sequence and intensity over fixed rings', () => {
    const def = EFFECTS.timeDelay;
    assert.equal(def.maxStep, def.phases.DEEP * 2, 'maxStep is DEEP at the top intensity, 2');
    const engine = playing('timeDelay');
    assert.equal(engine.active.option, 'ltr', 'the first option is the default');
    const start = engine.compute(COLUMN_COUNT, 1, 0);
    assert.deepEqual(start.delay, [0, 2, 4, 6, 8]);
    assert.deepEqual(start.delayRings, [0, 5, 9, 13, 17]);
    assert.deepEqual(engine.compute(COLUMN_COUNT, 1, 2).delay, [0, 1, 2, 3, 4], 'SHALLOW one step (two beats at rate 1/2) later');
    const deep = playing('timeDelay', { intensity: 2 }).compute(COLUMN_COUNT, 1, 0);
    assert.deepEqual(deep.delay, [0, 4, 8, 12, 16]);
    assert.deepEqual(deep.delayRings, start.delayRings, 'intensity never reallocates the rings');
    deep.delay.forEach((frames, i) => assert.ok(frames < Math.max(1, deep.delayRings[i]), `column ${i} fits its ring`));
    assert.deepEqual(playing('timeDelay', { option: 'center' }).compute(COLUMN_COUNT, 1, 0).delay, [4, 2, 0, 2, 4]);
});
