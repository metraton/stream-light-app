// Checks that the cue flow stages every scene change: with a cue armed, a key
// leaves the live state alone, and Space commits it. Run: node --test tests/test_cue_flow.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StreamLightApp } from '../js/app.js';
import { BASE_STATE, MOODS } from '../js/mood-map.js';
import { resolveShortcut } from '../js/shortcuts.js';

/** A real app with the stage away: columns are stubbed and there is no panel. */
function stageApp() {
    const app = new StreamLightApp();
    app.columnManager = { resetOffsets() {}, setAllGlow() {} };
    return app;
}

function press(app, key, code, shiftKey = false) {
    resolveShortcut({ key, code, shiftKey, ctrlKey: false, altKey: false })(app);
}

const BACKSPACE = ['Backspace', 'Backspace'];
const SPACE = [' ', 'Space'];
const ESCAPE = ['Escape', 'Escape'];
const SHIFT_C = ['C', 'KeyC', true];   // Build
const SHIFT_Z = ['Z', 'KeyZ', true];   // Calm
const SHIFT_X = ['X', 'KeyX', true];   // Groove
const LESS_THAN = ['<', 'IntlBackslash'];   // Mood None

/** Every layer a key can change, as plain data. */
function live(app) {
    const seq = app.sequencer;
    return {
        colors: [...seq.selectedColors],
        pattern: seq.pattern,
        variant: seq.variant,
        movement: app.currentMovement,
        glow: app.currentGlowMode,
        mood: app.currentMood,
        bpm: seq.bpm,
    };
}

const BASE_LIVE = {
    colors: [], pattern: 'none', variant: false, movement: 'none', glow: 'none', mood: null, bpm: BASE_STATE.bpm,
};

test('startup is the base state', () => {
    assert.deepEqual(live(stageApp()), BASE_LIVE);
});

test('a mood pressed with a cue armed leaves the live state alone until Space', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    assert.deepEqual(live(app), BASE_LIVE);
    assert.equal(app.sequencer.staging, true, 'the mood does not cancel the cue');
    assert.deepEqual(app.sequencer.pendingColors, MOODS.build.colors);
    assert.equal(app.sequencer.pendingPattern, 'fill');

    press(app, ...SPACE);
    assert.deepEqual(live(app), {
        colors: MOODS.build.colors, pattern: 'fill', variant: false,
        movement: 'broken', glow: 'sweep', mood: 'build', bpm: MOODS.build.bpm,
    });
    assert.equal(app.sequencer.staging, false);
    assert.equal(app.sequencer.isPlaying, true);
});

test('a mood is committed together with the other staged changes, in press order', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    press(app, 'd', 'KeyD');
    press(app, '4', 'Digit4');
    assert.deepEqual(live(app), BASE_LIVE);

    press(app, ...SPACE);
    assert.deepEqual(live(app), {
        colors: [...MOODS.build.colors, 3], pattern: 'fill', variant: false,
        movement: 'expand', glow: 'sweep', mood: null, bpm: MOODS.build.bpm,
    });
});

test('the last mood pressed on a cue wins, and Mood None after it keeps the layers', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    press(app, ...SHIFT_Z);
    press(app, ...SPACE);
    assert.equal(app.currentMood, 'calm');
    assert.deepEqual([app.currentMovement, app.currentGlowMode, app.sequencer.bpm], ['wave', 'breathe', MOODS.calm.bpm]);

    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    press(app, ...LESS_THAN);
    assert.equal(app.currentMood, 'calm', 'Mood None waits for the commit too');
    press(app, ...SPACE);
    assert.equal(app.currentMood, null);
    assert.equal(app.currentMovement, 'broken', 'None clears only the highlight');
});

test('Shift+Z X C V B N play calm, groove, build, tension, peak, mystic; Shift+Z is not None', () => {
    const names = ['calm', 'groove', 'build', 'tension', 'peak', 'mystic'];
    ['Z', 'X', 'C', 'V', 'B', 'N'].forEach((letter, i) => {
        const app = stageApp();
        press(app, letter, `Key${letter}`, true);
        assert.equal(app.currentMood, names[i], `Shift+${letter}`);
        assert.equal(app.sequencer.bpm, MOODS[names[i]].bpm);
    });
});

test('< is Mood None: it clears only the highlight, live and on a cue', () => {
    const app = stageApp();
    press(app, ...SHIFT_X);
    press(app, ...LESS_THAN);
    assert.equal(app.currentMood, null);
    assert.equal(app.currentMovement, 'wave', 'the layers keep playing');
    assert.equal(app.sequencer.bpm, MOODS.groove.bpm);
});

test('groove goes through the cue: staged on Backspace, live on Space', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_X);
    assert.deepEqual(live(app), BASE_LIVE);
    assert.deepEqual(app.sequencer.pendingColors, [1, 3]);
    assert.equal(app.sequencer.pendingPattern, 'carousel');

    press(app, ...SPACE);
    assert.deepEqual(live(app), {
        colors: [1, 3], pattern: 'carousel', variant: false,
        movement: 'wave', glow: 'pulse', mood: 'groove', bpm: 120,
    });
});

test('a movement key with a cue armed plays only on Space', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, 's', 'KeyS');
    assert.equal(app.currentMovement, 'none');
    assert.equal(app.effectEngine.active, null);
    press(app, ...SPACE);
    assert.equal(app.currentMovement, 'wave');
    assert.equal(app.effectEngine.active.name, 'wave');
});

test('J plays Golpe de zoom through the same path as A S D F G H, cue staging included', () => {
    const keys = [['s', 'wave'], ['d', 'expand'], ['f', 'broken'], ['g', 'shake'], ['h', 'equalizer'], ['j', 'zoomPulse']];
    for (const [key, movement] of keys) {
        const played = [];
        const spy = { playMovement: (name) => played.push(name), refreshPanel() {} };
        press(spy, key, `Key${key.toUpperCase()}`);
        assert.deepEqual(played, [movement], `${key} plays ${movement}`);
    }

    const live = stageApp();
    press(live, 'j', 'KeyJ');
    assert.equal(live.currentMovement, 'zoomPulse');
    assert.equal(live.effectEngine.active.name, 'zoomPulse');

    const armed = stageApp();
    press(armed, ...BACKSPACE);
    press(armed, 'j', 'KeyJ');
    assert.equal(armed.currentMovement, 'none', 'staged, not playing');
    assert.equal(armed.effectEngine.active, null);
    press(armed, ...SPACE);
    assert.equal(armed.currentMovement, 'zoomPulse');
    assert.equal(armed.effectEngine.active.name, 'zoomPulse');

    assert.equal(resolveShortcut({ key: 'J', code: 'KeyJ', shiftKey: true, ctrlKey: false, altKey: false }), null);
});

test('the HUD is gone: no toggle, and nothing on the app draws one', () => {
    const app = stageApp();
    assert.equal(app.toggleHUD, undefined);
    assert.equal(app.updateHUD, undefined);
    assert.equal('hud' in app, false);
    assert.equal(typeof app.refreshPanel, 'function');
});

test('a glow key with a cue armed plays only on Space', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, 'x', 'KeyX');
    assert.equal(app.currentGlowMode, 'none');
    assert.equal(app.glowEngine.active, null);
    press(app, ...SPACE);
    assert.equal(app.currentGlowMode, 'sweep');
    assert.notEqual(app.glowEngine.active, null);
});

test('a pattern key drops the mood highlight, with a cue armed only on Space', () => {
    const app = stageApp();
    press(app, ...SHIFT_Z);
    press(app, 'r', 'KeyR');
    assert.equal(app.currentMood, null, 'live: a manual pattern leaves the mood');

    press(app, ...SHIFT_Z);
    press(app, ...BACKSPACE);
    press(app, 'r', 'KeyR');
    assert.equal(app.currentMood, 'calm', 'armed: the highlight stays until commit');
    press(app, ...SPACE);
    assert.equal(app.currentMood, null);
    assert.equal(app.sequencer.pattern, 'mirror');
});

test('Space commits the staged layers and sends the unpressed ones to the base state', () => {
    const app = stageApp();
    press(app, ...SHIFT_Z);
    press(app, ...BACKSPACE);
    press(app, '5', 'Digit5');
    press(app, ...SPACE);
    assert.deepEqual(live(app), { ...BASE_LIVE, colors: [4], bpm: MOODS.calm.bpm });
});

test('Backspace again starts the cue over, dropping staged layers', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    press(app, ...BACKSPACE);
    press(app, ...SPACE);
    assert.deepEqual(live(app), BASE_LIVE);
});

test('Escape cancels the cue and its staged layers, and the next cue commits only its own', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, ...SHIFT_C);
    press(app, ...ESCAPE);
    assert.equal(app.sequencer.staging, false);
    assert.deepEqual(app.stagedChanges, []);
    assert.deepEqual(live(app), BASE_LIVE);

    press(app, ...BACKSPACE);
    press(app, ...SPACE);
    assert.deepEqual(live(app), BASE_LIVE);
});

test('Escape returns a played mood to the base state', () => {
    const app = stageApp();
    press(app, ...SHIFT_C);
    assert.equal(app.currentMood, 'build', 'without a cue a mood applies at once');
    press(app, ...ESCAPE);
    assert.deepEqual(live(app), BASE_LIVE);
});

test('BPM stays live with a cue armed, and the commit keeps it', () => {
    const app = stageApp();
    press(app, ...BACKSPACE);
    press(app, '+', 'Equal');
    assert.equal(app.sequencer.bpm, BASE_STATE.bpm + 10);
    press(app, ...SPACE);
    assert.equal(app.sequencer.bpm, BASE_STATE.bpm + 10);
});
