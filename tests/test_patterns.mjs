// Checks the color patterns, the scene states and the key grid without a
// browser, plus `node --check` on every JS file. Run: node --test tests/test_patterns.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, PATTERN_RATES, ColorSequencer, generateFrames, canonicalPattern } from '../js/color-sequencer.js';
import { BeatClock, RATES } from '../js/tempo.js';
import { EffectEngine } from '../js/effect-engine.js';
import { GlowEngine } from '../js/glow-engine.js';
import { BASE_STATE, MOODS, MOOD_QUICK } from '../js/mood-map.js';
import { GLOW_QUICK, GLOW_MODE_SEQUENCE, canonicalGlowMode } from '../js/glow-map.js';
import { GLOW_SEQUENCES } from '../js/glow-sequences.js';
import { EFFECTS } from '../js/effects.js';
import { resolveShortcut } from '../js/shortcuts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMN_COUNT = 5;

/** Every ordered subset of `pool` with 1 to 5 members, in pool order. */
function combos(pool) {
    const result = [];
    for (let mask = 1; mask < 1 << pool.length; mask++) {
        const combo = pool.filter((_, i) => mask & (1 << i));
        if (combo.length <= 5) result.push(combo);
    }
    return result;
}

const distinctFrames = (frames) => new Set(frames.map(f => f.join(','))).size;

for (const pattern of PATTERNS) {
    test(`${pattern}: every frame is valid for every 1-5 color combo, Empty included`, () => {
        for (const colors of combos([-1, 0, 1, 2, 3, 4])) {
            const frames = generateFrames(pattern, colors);
            assert.ok(frames.length > 0, `${pattern} ${colors} produced no frames`);
            for (const frame of frames) {
                assert.equal(frame.length, COLUMN_COUNT, `${pattern} ${colors}: ${frame}`);
                for (const value of frame) {
                    assert.ok(value === -1 || colors.includes(value), `${pattern} ${colors}: ${frame}`);
                }
            }
        }
    });

    test(`${pattern}: one selected color ${pattern === 'none' ? 'holds still' : 'gives at least 2 distinct frames'}`, () => {
        for (const color of [0, 1, 2, 3, 4]) {
            const count = distinctFrames(generateFrames(pattern, [color]));
            if (pattern === 'none') {
                assert.equal(count, 1);
            } else {
                assert.ok(count >= 2, `${pattern} [${color}] has ${count} distinct frame(s)`);
            }
        }
    });
}

test('none fills every column with one color: still with one, a blink per step with several', () => {
    assert.deepEqual(generateFrames('none', [3]), [[3, 3, 3, 3, 3]]);
    assert.deepEqual(generateFrames('none', [2, 0]), [[2, 2, 2, 2, 2], [0, 0, 0, 0, 0]]);
    for (const colors of combos([-1, 0, 1, 2, 3, 4])) {
        const frames = generateFrames('none', colors);
        assert.equal(frames.length, colors.length, `none ${colors}`);
        frames.forEach((frame, i) => assert.deepEqual(frame, new Array(COLUMN_COUNT).fill(colors[i])));
    }
});

test('mirror grows from the center column; fill grows left to right', () => {
    assert.deepEqual(generateFrames('mirror', [1]).slice(0, 3),
        [[-1, -1, 1, -1, -1], [-1, 1, 1, 1, -1], [1, 1, 1, 1, 1]]);
    assert.deepEqual(generateFrames('fill', [2, 0]).slice(5, 7),
        [[0, 2, 2, 2, 2], [0, 0, 2, 2, 2]]);
});

test('sparkle is 16 frames, deterministic per combo', () => {
    for (const colors of combos([0, 1, 2, 3, 4])) {
        const frames = generateFrames('sparkle', colors);
        assert.equal(frames.length, 16);
        assert.deepEqual(generateFrames('sparkle', [...colors]), frames);
    }
});

test('no colors selected gives no frames', () => {
    for (const pattern of PATTERNS) assert.deepEqual(generateFrames(pattern, []), []);
});

test('removed pattern and glow names map to their replacements', () => {
    assert.equal(canonicalPattern('solid'), 'none');
    assert.equal(canonicalPattern('pingpong'), 'chase');
    assert.equal(canonicalPattern('alternate'), 'carousel');
    assert.deepEqual(generateFrames('solid', [1, 2]), generateFrames('none', [1, 2]));
    assert.equal(canonicalGlowMode('bounce'), 'sweep');
    assert.equal(canonicalGlowMode('cascade'), 'sweep');
    assert.equal(canonicalGlowMode('alternate'), 'alternate');
});

test('glow and mood rows have 6 keys, None first; every glow mode has a sequence', () => {
    assert.deepEqual(GLOW_QUICK.map(g => g.key), ['z', 'x', 'c', 'v', 'b', 'n']);
    assert.equal(GLOW_QUICK[0].mode, 'none');
    assert.deepEqual(MOOD_QUICK.map(m => m.key), ['z', 'x', 'c', 'v', 'b', 'n']);
    assert.equal(MOOD_QUICK[0].mood, null);
    for (const { mode } of GLOW_QUICK.slice(1)) {
        assert.ok(GLOW_SEQUENCES[GLOW_MODE_SEQUENCE[mode] ?? mode], `glow ${mode} has no sequence`);
    }
});

test('base state and every mood name a real button, so their highlights match', () => {
    const glowModes = GLOW_QUICK.map(g => g.mode);
    for (const [name, state] of [['base', BASE_STATE], ...Object.entries(MOODS)]) {
        assert.ok(PATTERNS.includes(state.pattern), `${name} pattern ${state.pattern}`);
        assert.ok(glowModes.includes(state.glow), `${name} glow ${state.glow}`);
        assert.ok(state.movement === 'none' || EFFECTS[state.movement], `${name} movement ${state.movement}`);
    }
    assert.deepEqual(MOOD_QUICK.slice(1).map(m => m.mood).sort(), Object.keys(MOODS).sort());
});

test('Q W E R T Y resolve to the patterns in panel order: T is Fill, Y is Sparkle', () => {
    const patternFor = (key) => {
        let pattern = null;
        const app = { sequencer: { setPattern: (p) => { pattern = p; } }, updateHUD() {} };
        resolveShortcut({ key, code: `Key${key.toUpperCase()}`, shiftKey: false, ctrlKey: false, altKey: false })(app);
        return pattern;
    };
    assert.deepEqual(['q', 'w', 'e', 'r', 't', 'y'].map(patternFor), PATTERNS);
    assert.equal(patternFor('t'), 'fill');
    assert.equal(patternFor('y'), 'sparkle');
});

/** An app stand-in around a real sequencer, its other layers away from the base state. */
function fakeApp() {
    return { sequencer: new ColorSequencer(), currentMovement: 'wave', currentGlowMode: 'pulse', currentMood: 'calm', updateHUD() {} };
}

function press(app, key, code, shiftKey = false) {
    resolveShortcut({ key, code, shiftKey, ctrlKey: false, altKey: false })(app);
}

test('6 and Shift+6 select each color once in a fresh random order and change nothing else', () => {
    for (const [key, shiftKey] of [['6', false], ['&', true]]) {
        const app = fakeApp();
        const seq = app.sequencer;
        seq.setPattern('mirror');
        seq.setRate(4);
        seq.setBPM(150);
        const orders = new Set();
        for (let i = 0; i < 20; i++) {
            press(app, key, 'Digit6', shiftKey);
            assert.deepEqual([...seq.selectedColors].sort(), [0, 1, 2, 3, 4]);
            orders.add(seq.selectedColors.join());
        }
        assert.ok(orders.size > 1, `${key}: 20 presses gave one order`);
        assert.equal(seq.pattern, 'mirror');
        assert.equal(seq.rate, 4);
        assert.equal(seq.bpm, 150);
        assert.deepEqual(seq.frames, generateFrames('mirror', seq.selectedColors));
        assert.deepEqual([app.currentMovement, app.currentGlowMode, app.currentMood], ['wave', 'pulse', 'calm']);
    }
});

test('6 while a cue is staged fills the pending colors and leaves the live combo alone', () => {
    const app = fakeApp();
    const seq = app.sequencer;
    seq.selectOnly(2);
    seq.startStaging('chase');
    press(app, '6', 'Digit6');
    assert.deepEqual([...seq.pendingColors].sort(), [0, 1, 2, 3, 4]);
    assert.equal(seq.pendingPattern, 'chase');
    assert.deepEqual(seq.selectedColors, [2]);
});

test('a BPM change keeps the beat position continuous', () => {
    const clock = new BeatClock(120, 0);
    const before = clock.beatAt(3210);
    clock.setBPM(175, 3210);
    assert.ok(Math.abs(clock.beatAt(3210) - before) < 1e-9);
    assert.ok(Math.abs(clock.beatAt(4210) - before - 175 / 60) < 1e-9);
});

test('rate and BPM changes keep every movement and glow position continuous', () => {
    const EPS = 1e-9;
    const cases = [
        ...Object.entries(EFFECTS).map(([name, def]) => [name, def, new EffectEngine(), (e, b) => e.compute(5, 1, b)]),
        ...Object.entries(GLOW_SEQUENCES).map(([name, def]) => [name, def, new GlowEngine(), (e, b) => e.compute(5, b)]),
    ];
    for (const [name, def, engine, sample] of cases) {
        const clock = new BeatClock(120, 0);
        engine.play(name, def, { rate: def.rate, easing: def.easing, intensity: 1 }, clock.beatAt(100));
        const changes = [
            [1337, () => engine.setRate(4, clock.beatAt(1337))],
            [2711, () => clock.setBPM(60, 2711)],
            [4099, () => engine.setRate(0.25, clock.beatAt(4099))],
            [5003, () => clock.setBPM(175, 5003)],
        ];
        for (const [time, change] of changes) {
            const before = Object.values(sample(engine, clock.beatAt(time))).flat();
            change();
            const after = Object.values(sample(engine, clock.beatAt(time))).flat();
            before.forEach((v, i) => assert.ok(Math.abs(v - after[i]) < EPS, `${name} jumped at ${time} ms`));
        }
    }
});

// Peak displacement each movement may reach at intensity 1, in 1080p px or in
// scaleY, agreed with the user so the movements read as one family: Wave and
// Expand set the 15 px reference.
const MOVEMENT_PEAK_BOUNDS = {
    wave:      { px: [14, 15] },
    expand:    { px: [14, 15] },
    broken:    { px: [7, 8] },
    shake:     { px: [1.5, 2] },
    equalizer: { scale: [0.035, 0.04] },
};

test('every movement peaks within its agreed bounds', () => {
    assert.deepEqual(Object.keys(MOVEMENT_PEAK_BOUNDS).sort(), Object.keys(EFFECTS).sort());
    for (const [name, def] of Object.entries(EFFECTS)) {
        const engine = new EffectEngine();
        engine.play(name, def, { rate: 1, easing: 'linear', intensity: 1 }, 0);
        let px = 0;
        let scale = 0;
        for (let beat = 0; beat < def.sequence.length; beat += 1 / 64) {
            const { offsetX, offsetY, scaleY } = engine.compute(COLUMN_COUNT, 1, beat);
            px = Math.max(px, ...offsetX.map(Math.abs), ...offsetY.map(Math.abs));
            scale = Math.max(scale, ...scaleY.map(Math.abs));
        }
        const { px: pxBounds = [0, 0], scale: scaleBounds = [0, 0] } = MOVEMENT_PEAK_BOUNDS[name];
        assert.ok(px >= pxBounds[0] - 1e-9 && px <= pxBounds[1] + 1e-9, `${name} peaks at ${px} px`);
        assert.ok(scale >= scaleBounds[0] - 1e-9 && scale <= scaleBounds[1] + 1e-9, `${name} peaks at scale ${scale}`);
    }
});

test('pulse and strobe flash at full intensity on every beat', () => {
    for (const name of ['pulse', 'strobe']) {
        const def = GLOW_SEQUENCES[name];
        const engine = new GlowEngine();
        engine.play(name, def, { rate: def.rate, easing: def.easing, intensity: 1 }, 0.37, true);
        for (const beat of [3, 4, 5, 17]) {
            assert.deepEqual(engine.compute(5, beat).intensity, [1, 1, 1, 1, 1], `${name} at beat ${beat}`);
        }
    }
});

test('effect definitions are frozen and every default and mood rate is a rate button', () => {
    assert.throws(() => { EFFECTS.wave.rate = 9; }, TypeError);
    assert.throws(() => { GLOW_SEQUENCES.pulse.rate = 9; }, TypeError);
    for (const def of [...Object.values(EFFECTS), ...Object.values(GLOW_SEQUENCES)]) assert.ok(RATES.includes(def.rate));
    for (const rate of Object.values(PATTERN_RATES)) assert.ok(RATES.includes(rate));
    for (const [name, mood] of Object.entries(MOODS)) {
        for (const layer of ['color', 'movement', 'glow']) assert.ok(RATES.includes(mood.rates[layer]), `${name} ${layer}`);
    }
});

const jsFiles = readdirSync(join(ROOT, 'js'), { recursive: true })
    .filter(file => file.endsWith('.js'))
    .map(file => join('js', file));

for (const file of jsFiles) {
    test(`node --check ${file}`, () => {
        const result = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    });
}
