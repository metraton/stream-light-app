// Downbeat on a color press, shared beat grid, mood BPM, BPM keys. Run: node --test tests/test_tempo.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StreamLightApp } from '../js/app.js';
import { MOODS } from '../js/mood-map.js';
import { resolveShortcut } from '../js/shortcuts.js';
import { BPM_MIN, BPM_MAX, RATES, RATE_LABELS } from '../js/tempo.js';

const EPS = 1e-9;
const realNow = performance.now;
let clockMs = 0;

beforeEach(() => {
    clockMs = 5000;
    performance.now = () => clockMs;
});

afterEach(() => {
    performance.now = realNow;
});

function stageApp() {
    const app = new StreamLightApp();
    app.columnManager = { resetOffsets() {}, setAllGlow() {} };
    return app;
}

function press(app, key, code, shiftKey = false) {
    resolveShortcut({ key, code, shiftKey, ctrlKey: false, altKey: false })(app);
}

const beatMs = (app) => 60000 / app.sequencer.bpm;
const beatNow = (app) => app.sequencer.beatAt(clockMs);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < EPS, `${message}: ${actual} != ${expected}`);

const COLOR_KEYS = [
    ['|', 'Backquote', false], ['|', 'Backquote', true],
    ...[1, 2, 3, 4, 5].flatMap(n => [[String(n), `Digit${n}`, false], ['!"·$%'[n - 1], `Digit${n}`, true]]),
    ['6', 'Digit6', false], ['&', 'Digit6', true],
];

test('every color key makes its press beat 0, at the current BPM', () => {
    for (const [key, code, shift] of COLOR_KEYS) {
        clockMs = 5000;
        const app = stageApp();
        app.sequencer.setBPM(128);
        clockMs = 12345;
        assert.ok(beatNow(app) > 1, 'the clock has run before the press');
        press(app, key, code, shift);
        near(beatNow(app), 0, `${key} shift=${shift} beat at the press`);
        clockMs += 3 * beatMs(app);
        near(beatNow(app), 3, `${key} shift=${shift} three beats later`);
        assert.equal(app.sequencer.bpm, 128, 'the press keeps the BPM');
    }
});

test('a color staged on a cue waits for the commit, and the commit is the downbeat', () => {
    const app = stageApp();
    press(app, 'Backspace', 'Backspace');
    clockMs = 9000;
    press(app, '2', 'Digit2');
    assert.ok(beatNow(app) > 1, 'a staged color leaves the live clock alone');
    clockMs = 11000;
    press(app, ' ', 'Space');
    near(beatNow(app), 0, 'beat at the commit');
});

test('after a color press pattern, movement and glow share the grid, and later keys stay on it', () => {
    const app = stageApp();
    press(app, 'w', 'KeyW');
    press(app, 's', 'KeyS');
    press(app, 'c', 'KeyC');
    clockMs = 7777;
    press(app, '1', 'Digit1');
    const pressMs = clockMs;
    const layers = () => [app.sequencer.phase, app.effectEngine.active.phase, app.glowEngine.active.phase];

    for (const beats of [0, 0.5, 1, 2.25, 7]) {
        clockMs = pressMs + beats * beatMs(app);
        for (const phase of layers()) near(phase.stepAt(beatNow(app)), beats * phase.rate, `step ${beats} beats in`);
    }

    clockMs = pressMs + 1.3 * beatMs(app);
    press(app, 'e', 'KeyE');
    press(app, 'd', 'KeyD');
    near(app.sequencer.beatAt(pressMs), 0, 'a pattern or movement key does not move the downbeat');
    near(app.effectEngine.active.phase.stepAt(beatNow(app)), 1.3 * app.effectEngine.active.phase.rate, 'movement on the grid');
    assert.equal(app.sequencer.currentStep, 0, 'the new pattern shows at once');
    const rate = app.sequencer.rate;
    clockMs = pressMs + (Math.floor(1.3 * rate + 1) / rate - 0.05) * beatMs(app);
    app.sequencer.update(clockMs);
    assert.equal(app.sequencer.currentStep, 0, 'no step before the next grid line');
    clockMs = pressMs + (Math.floor(1.3 * rate + 1) / rate + 0.05) * beatMs(app);
    app.sequencer.update(clockMs);
    assert.equal(app.sequencer.currentStep, 1, 'the next step lands on the grid line');
});

test('a mood keeps the live BPM, pressed live or committed from a cue', () => {
    for (const name of Object.keys(MOODS)) assert.equal('bpm' in MOODS[name], false, `${name} carries no BPM`);
    for (const letter of ['Z', 'X', 'C', 'V', 'B', 'N']) {
        const app = stageApp();
        app.sequencer.setBPM(97);
        press(app, letter, `Key${letter}`, true);
        assert.equal(app.sequencer.bpm, 97, `Shift+${letter} live`);
        press(app, 'Backspace', 'Backspace');
        press(app, letter, `Key${letter}`, true);
        press(app, ' ', 'Space');
        assert.equal(app.sequencer.bpm, 97, `Shift+${letter} from a cue`);
    }
});

test('BPM runs 60 to 200 in whole beats', () => {
    assert.deepEqual([BPM_MIN, BPM_MAX], [60, 200]);
    const app = stageApp();
    for (const [asked, kept] of [[250, 200], [10, 60], [127.6, 128], [60, 60], [200, 200], [133, 133]]) {
        app.sequencer.setBPM(asked);
        assert.equal(app.sequencer.bpm, kept, `setBPM(${asked})`);
    }
});

test('+ and ´ change BPM by 1, by 5 with Shift, and stop at the bounds', () => {
    const app = stageApp();
    app.sequencer.setBPM(120);
    const steps = [
        [['+', 'BracketRight'], 121],
        [['*', 'BracketRight', true], 126],
        [['´', 'Quote'], 125],
        [['Dead', 'Quote'], 124],
        [['Dead', 'Quote', true], 119],
        [['+', 'NumpadAdd'], 120],
    ];
    for (const [keystroke, bpm] of steps) {
        press(app, ...keystroke);
        assert.equal(app.sequencer.bpm, bpm, keystroke.join(' '));
    }
    app.sequencer.setBPM(198);
    press(app, '*', 'BracketRight', true);
    assert.equal(app.sequencer.bpm, 200);
    app.sequencer.setBPM(62);
    press(app, 'Dead', 'Quote', true);
    assert.equal(app.sequencer.bpm, 60);
});

test('rate buttons read as step length in beats, slowest first', () => {
    assert.deepEqual(RATES.map(r => RATE_LABELS.get(r)), ['4 golpes', '2 golpes', '1 golpe', '½', '¼']);
});
