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
    const { ringLengths, captureInterval, CAPTURE_MS, MAX_RING_FRAMES } = await import('../js/effect-engine.js');
    assert.equal(MAX_RING_FRAMES, 20);
    assert.deepEqual(ringLengths([0, 120, 240, 360, 480], CAPTURE_MS), [0, 5, 9, 12, 16]);
    assert.deepEqual(ringLengths([240, 120, 0, 120, 240], CAPTURE_MS), [9, 5, 0, 5, 9]);
    assert.deepEqual(ringLengths([0, 10000], CAPTURE_MS), [0, MAX_RING_FRAMES]);
    assert.equal(captureInterval(1000 / 60), CAPTURE_MS, 'frames faster than the cadence are not all kept');
    assert.equal(captureInterval(1000 / 30), CAPTURE_MS);
    assert.equal(captureInterval(100), 100, 'frames slower than the cadence set the interval');
    const total = interval => ringLengths([0, 120, 240, 360, 480], interval).reduce((sum, n) => sum + n, 0);
    assert.equal(total(captureInterval(1000 / 144)), total(captureInterval(1000 / 30)), 'memory does not grow with the frame rate');
    assert.ok(total(captureInterval(1000 / 10)) < total(CAPTURE_MS), 'slower frames need fewer of them');
});

/** Ages in ms of the frames a ring of `length` shows for `delayMs`, over 4 s at `fps`, once warmed up. */
async function shownAges(fps, delayMs, length) {
    const { FrameHistory, MAX_RING_FRAMES } = await import('../js/effect-engine.js');
    const history = new FrameHistory();
    const ages = [];
    for (let now = 0; now < 4000; now += 1000 / fps) {
        history.observe(now);
        history.capture(now);
        if (now < 1500) continue;
        ages.push(now - history.stamps[history.frameFor(length, delayMs, now) % MAX_RING_FRAMES]);
    }
    return ages;
}

const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;

test('desfase delay is the same number of ms at 30, 60 and 144 fps, within one capture interval', async () => {
    const { CAPTURE_MS, ringLengths } = await import('../js/effect-engine.js');
    const [length] = ringLengths([480], CAPTURE_MS);
    for (const delayMs of [60, 120, 240, 480]) {
        const means = [];
        for (const fps of [30, 60, 144]) {
            const ages = await shownAges(fps, delayMs, length);
            ages.forEach(age => assert.ok(Math.abs(age - delayMs) <= CAPTURE_MS, `${delayMs} ms at ${fps} fps showed ${age}`));
            means.push(mean(ages));
        }
        assert.ok(Math.max(...means) - Math.min(...means) < CAPTURE_MS / 2, `${delayMs} ms: mean ages ${means}`);
        means.forEach(m => assert.ok(Math.abs(m - delayMs) < CAPTURE_MS / 2, `${delayMs} ms: mean ${m}`));
    }
});

test('desfase never reads deeper than its ring or the frames kept, and shows the newest frame for no delay', async () => {
    const { FrameHistory, CAPTURE_MS, ringWriteSlot } = await import('../js/effect-engine.js');
    const history = new FrameHistory();
    for (let n = 0; n < 40; n++) {
        history.observe(n * CAPTURE_MS);
        const kept = history.capture(n * CAPTURE_MS);
        assert.equal(kept, n, 'at the cadence every frame is kept');
        for (const length of [1, 5, 16]) {
            const shown = history.frameFor(length, 100000, n * CAPTURE_MS);
            assert.equal(shown, Math.max(0, n - (length - 1)), `length ${length}, frame ${n}: the oldest the ring holds`);
            assert.equal(history.frameFor(length, 0, n * CAPTURE_MS), n);
            assert.ok(ringWriteSlot(shown, length) < length);
        }
    }
});

test('desfase in the engine: a staircase in ms that breathes with the sequence and intensity', () => {
    const def = EFFECTS.timeDelay;
    assert.equal(def.maxStep, def.phases.DEEP * 2, 'maxStep is DEEP at the top intensity, 2');
    assert.equal(def.phases.DEEP, 60, 'about 60 ms per panel step');
    const engine = playing('timeDelay');
    assert.equal(engine.active.option, 'ltr', 'the first option is the default');
    const start = engine.compute(COLUMN_COUNT, 1, 0);
    assert.deepEqual(start.delay, [0, 60, 120, 180, 240]);
    assert.deepEqual(start.delayCap, [0, 120, 240, 360, 480]);
    assert.deepEqual(engine.compute(COLUMN_COUNT, 1, 2).delay, [0, 30, 60, 90, 120], 'SHALLOW one step (two beats at rate 1/2) later');
    const deep = playing('timeDelay', { intensity: 2 }).compute(COLUMN_COUNT, 1, 0);
    assert.deepEqual(deep.delay, [0, 120, 240, 360, 480]);
    assert.deepEqual(deep.delayCap, start.delayCap, 'intensity never changes what the rings must hold');
    deep.delay.forEach((ms, i) => assert.ok(ms <= deep.delayCap[i], `column ${i} fits its ring`));
    assert.deepEqual(playing('timeDelay', { option: 'center' }).compute(COLUMN_COUNT, 1, 0).delay, [120, 60, 0, 60, 120]);
    const slowBpm = playing('timeDelay').compute(COLUMN_COUNT, 1, 0.9);
    assert.ok(slowBpm.delay.every(ms => Number.isFinite(ms)), 'the delay is a time, whatever the beat');
});

test('congelado dims a frozen panel only while it is held, on top of its color, and clears after', async () => {
    const { frozenSteps, scaleTint, FREEZE_DIM } = await import('../js/effect-engine.js');
    class Sprite {
        constructor() {
            Object.assign(this, { tint: 0xFFFFFF, visible: true, texture: null, filters: null, rotation: 0 });
            for (const field of ['anchor', 'scale', 'position']) this[field] = { copyFrom() {} };
        }
        destroy() {}
    }
    globalThis.PIXI = { Sprite, RenderTexture: { create: ({ width, height }) => ({ width, height, destroy() {} }) } };
    const info = console.info;
    console.info = () => {};
    const { FrozenFrames } = await import('../js/columns.js');
    const color = 0x4080FF;
    const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => ({
        index, width: 10, height: 20, sprite: Object.assign(new Sprite(), { tint: color }),
        container: { addChild(child) { this.display = child; } },
    }));
    const frames = new FrozenFrames({ render() {} });
    const displays = () => columns.map(col => col.container.display);

    frames.sync(columns, { frozen: frozenSteps(3.25, COLUMN_COUNT, 'turns', 0.5) });
    console.info = info;
    assert.equal(FREEZE_DIM, 0.85);
    const [held, ...others] = [columns[3], ...columns.filter(col => col.index !== 3)];
    assert.equal(held.container.display.visible, true);
    assert.equal(held.container.display.tint, scaleTint(color, FREEZE_DIM), 'the held frame is its color, dimmed');
    assert.ok(held.container.display.tint < color);
    assert.equal(held.sprite.visible, false);
    for (const col of others) {
        assert.equal(col.container.display.visible, false, `column ${col.index} is live`);
        assert.equal(col.sprite.visible, true);
    }

    frames.sync(columns, { frozen: frozenSteps(3.75, COLUMN_COUNT, 'turns', 0.5) });
    for (const display of displays()) assert.deepEqual([display.visible, display.tint], [false, 0xFFFFFF], 'the dim is cleared');
    assert.ok(columns.every(col => col.sprite.visible && col.sprite.tint === color), 'the live panels keep their full color');

    frames.sync(columns, { frozen: frozenSteps(4.1, COLUMN_COUNT, 'all', 0.5) });
    assert.ok(displays().every(d => d.visible && d.tint === scaleTint(color, FREEZE_DIM)), 'Todas dims every panel');
    frames.sync(columns, { frozen: null });
    assert.ok(columns.every(col => col.sprite.visible && col.sprite.tint === color));
    assert.equal(scaleTint(0xFFFFFF, FREEZE_DIM), 0xD9D9D9);
});
