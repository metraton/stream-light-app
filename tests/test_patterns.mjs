// Checks the color patterns, the scene states and the key grid without a
// browser, plus `node --check` on every JS file. Run: node --test tests/test_patterns.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, generateFrames, canonicalPattern } from '../js/color-sequencer.js';
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

test('none spreads the selected colors across the columns', () => {
    assert.deepEqual(generateFrames('none', [0, 1, 2, 3, 4]), [[0, 1, 2, 3, 4]]);
    assert.deepEqual(generateFrames('none', [2, 0]), [[2, 2, 2, 0, 0]]);
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

const jsFiles = readdirSync(join(ROOT, 'js'), { recursive: true })
    .filter(file => file.endsWith('.js'))
    .map(file => join('js', file));

for (const file of jsFiles) {
    test(`node --check ${file}`, () => {
        const result = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    });
}
