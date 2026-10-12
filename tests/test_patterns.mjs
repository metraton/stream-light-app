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
const KEY = { shiftKey: false, ctrlKey: false, altKey: false };
const SPACE = { ...KEY, key: ' ', code: 'Space' };
const ESCAPE = { ...KEY, key: 'Escape', code: 'Escape' };

test('playback is on at startup, so the first color advances frames with no play()', () => {
    const seq = new ColorSequencer();
    assert.equal(BASE_STATE.playing, true);
    assert.equal(seq.isPlaying, true);
    seq.setPattern('chase');
    seq.toggleColor(0);
    const start = performance.now();
    const stepMs = (60000 / seq.bpm) / seq.rate;
    seq.update(start + stepMs * 0.5);
    assert.equal(seq.currentStep, 0, 'the first color starts at frame 0');
    seq.update(start + stepMs * 1.5);
    assert.equal(seq.currentStep, 1, 'one step later chase has moved on');
});

test('Escape returns to playing with no colors', () => {
    const seq = new ColorSequencer();
    const app = { sequencer: seq, updateHUD() {}, resetToBase: () => seq.resetToBase() };
    resolveShortcut(SPACE)(app);
    seq.toggleColor(0);
    resolveShortcut(ESCAPE)(app);
    assert.equal(seq.isPlaying, true);
    assert.deepEqual(seq.selectedColors, []);
});

test('a Space pause holds while colors are added; Space and a cue commit play again', () => {
    const seq = new ColorSequencer();
    const app = { sequencer: seq, updateHUD() {}, commitCue: () => seq.commitStaged() };
    resolveShortcut(SPACE)(app);
    assert.equal(seq.isPlaying, false);
    seq.setPattern('chase');
    seq.toggleColor(0);
    seq.update(performance.now() + 60000);
    assert.equal(seq.isPlaying, false);
    assert.equal(seq.currentStep, 0);
    resolveShortcut(SPACE)(app);
    assert.equal(seq.isPlaying, true, 'Space resumes');

    resolveShortcut(SPACE)(app);
    seq.startStaging();
    seq.toggleColor(1);
    resolveShortcut(SPACE)(app);
    assert.equal(seq.isPlaying, true, 'a cue commit plays');
    assert.equal(seq.currentStep, 0, 'a cue commit starts at frame 0');
});

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

const invert = (frame, color) => frame.map(c => (c === -1 ? color : -1));

test('every negative swaps lit and Empty columns of its normal pattern, color by color, for 1 to 5 colors', () => {
    for (const pattern of ['chase', 'mirror', 'fill', 'sparkle']) {
        for (const colors of combos([0, 1, 2, 3, 4])) {
            const expected = colors.flatMap(color => generateFrames(pattern, [color]).map(f => invert(f, color)));
            assert.deepEqual(generateFrames(pattern, colors, true), expected, `${pattern} ${colors}`);
        }
    }
    assert.deepEqual(generateFrames('chase', [1], true).slice(0, 2), [[-1, 1, 1, 1, 1], [1, -1, 1, 1, 1]]);
    assert.deepEqual(generateFrames('mirror', [1], true).slice(0, 3),
        [[1, 1, -1, 1, 1], [1, -1, -1, -1, 1], [-1, -1, -1, -1, -1]]);
    assert.deepEqual(generateFrames('fill', [2], true).slice(0, 2), [[-1, 2, 2, 2, 2], [-1, -1, 2, 2, 2]]);
    for (const frame of generateFrames('sparkle', [4], true)) {
        const dark = frame.filter(c => c === -1).length;
        assert.ok(dark >= 2 && dark <= 3, `sparkle negative ${frame}`);
    }
});

test('carousel reversed plays the normal frames backwards from the same first frame', () => {
    for (const colors of combos([0, 1, 2, 3, 4])) {
        const normal = generateFrames('carousel', colors);
        assert.deepEqual(generateFrames('carousel', colors, true),
            normal.map((_, step) => normal[(normal.length - step) % normal.length]), `carousel ${colors}`);
    }
    assert.deepEqual(generateFrames('carousel', [0, 1, 2], true).slice(0, 2), [[0, 1, 2, 0, 1], [2, 0, 1, 2, 0]]);
});

test('Shift+W E R T Y play the variant, plain keys the normal pattern, Shift never toggles, Shift+Q is Q', () => {
    const app = fakeApp();
    const seq = app.sequencer;
    seq.selectOnly(1);
    for (const [key, pattern] of [['W', 'chase'], ['E', 'carousel'], ['R', 'mirror'], ['T', 'fill'], ['Y', 'sparkle']]) {
        press(app, key, `Key${key}`, true);
        press(app, key, `Key${key}`, true);
        assert.deepEqual([seq.pattern, seq.variant], [pattern, true], `Shift+${key} twice`);
        assert.deepEqual(seq.frames, generateFrames(pattern, [1], true));
        press(app, key.toLowerCase(), `Key${key}`);
        assert.deepEqual([seq.pattern, seq.variant], [pattern, false], key);
        assert.deepEqual(seq.frames, generateFrames(pattern, [1]));
    }
    press(app, 'Q', 'KeyQ', true);
    assert.deepEqual([seq.pattern, seq.variant], ['none', false]);
    assert.deepEqual(seq.frames, generateFrames('none', [1]));
});

test('a variant pressed while cueing is staged and goes live on commit', () => {
    const app = fakeApp();
    const seq = app.sequencer;
    seq.startStaging('none');
    seq.toggleColor(3);
    press(app, 'R', 'KeyR', true);
    assert.deepEqual([seq.pattern, seq.variant, seq.pendingPattern, seq.pendingVariant], ['none', false, 'mirror', true]);
    seq.commitStaged();
    assert.deepEqual([seq.pattern, seq.variant], ['mirror', true]);
    assert.deepEqual(seq.frames, generateFrames('mirror', [3], true));
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
// Expand set the 15 px reference. The extra movements are checked in
// tests/test_movements_extra.mjs.
const MOVEMENT_PEAK_BOUNDS = {
    wave:      { px: [14, 15] },
    expand:    { px: [14, 15] },
    broken:    { px: [11, 12] },
    shake:     { px: [1.5, 2] },
    equalizer: { scale: [0.035, 0.04] },
};
const KEYED_MOVEMENTS = Object.entries(EFFECTS).filter(([, def]) => !def.extra);

test('every keyed movement peaks within its agreed bounds', () => {
    assert.deepEqual(Object.keys(MOVEMENT_PEAK_BOUNDS).sort(), KEYED_MOVEMENTS.map(([name]) => name).sort());
    for (const [name, def] of KEYED_MOVEMENTS) {
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

test('every non-flat broken phase is a staircase, monotonic across the columns', () => {
    for (const [name, offsets] of Object.entries(EFFECTS.broken.phases)) {
        if (offsets.every(v => v === 0)) continue;
        const steps = offsets.slice(1).map((v, i) => v - offsets[i]);
        assert.ok(steps.every(s => s > 0) || steps.every(s => s < 0), `broken ${name} is not monotonic: ${offsets}`);
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

test('every mood easing is a panel easing; tension glow plays Pulsada fuerte', async () => {
    const { EASING_MODES, sameCurve } = await import('../js/panel/layer-controls.js');
    const { EASING_MAP } = await import('../js/easing.js');
    for (const [name, mood] of Object.entries(MOODS)) {
        for (const [layer, easing] of Object.entries(mood.easings ?? {})) {
            assert.ok(['movement', 'glow'].includes(layer), `${name} ${layer}`);
            assert.ok(Object.hasOwn(EASING_MAP, easing), `${name} ${layer} ${easing}`);
            assert.ok(EASING_MODES.some(m => sameCurve(m.curve, easing)), `${name} ${layer} ${easing}`);
        }
    }

    const { tension } = MOODS;
    const name = GLOW_MODE_SEQUENCE[tension.glow] ?? tension.glow;
    const def = GLOW_SEQUENCES[name];
    const engine = new GlowEngine();
    engine.play(name, def, { rate: tension.rates.glow, easing: tension.easings.glow ?? def.easing, intensity: 1 }, 0, true);
    const highlighted = EASING_MODES.find(m => sameCurve(m.curve, engine.active.easing));
    assert.equal(highlighted.label, 'Pulsada fuerte');
    assert.notEqual(def.easing, tension.easings.glow, 'the mood overrides pulse\'s own curve');
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
