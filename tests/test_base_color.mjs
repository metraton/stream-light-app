// The base an unlit (-1) column shows: the | cycle, Shift+| reset, Escape, moods,
// presets and the -1 -> base mapping. Run: node --test tests/test_base_color.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import {
    BASE_CAMERA, BASE_DIM, BASE_BLACK, BLACK_TINT, nextBase, restoreBase, effectiveBase, baseName, unlitTint, frameLooks,
} from '../js/base-color.js';
import { StreamLightApp } from '../js/app.js';
import { MOODS } from '../js/mood-map.js';
import { resolveShortcut } from '../js/shortcuts.js';
import { savePreset, loadPreset, resetToDefaults } from '../js/panel/preset-manager.js';

const KEY = { ctrlKey: false, altKey: false };
const PIPE = { ...KEY, key: '|', code: 'Backquote', shiftKey: false };
const SHIFT_PIPE = { ...PIPE, shiftKey: true };
const ESCAPE = { ...KEY, key: 'Escape', code: 'Escape', shiftKey: false };
const NEUTRAL = { colorName: 'NEUTRAL', tint: 0xFFFFFF };

function stageApp() {
    const app = new StreamLightApp();
    app.columnManager = { resetOffsets() {}, setAllGlow() {} };
    return app;
}

function cycle(selected, presses) {
    const seen = [];
    let base = BASE_CAMERA;
    for (let i = 0; i < presses; i++) {
        base = nextBase(base, selected);
        seen.push(base);
    }
    return seen;
}

function memoryStorage() {
    const map = new Map();
    return {
        getItem: k => map.get(k) ?? null,
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        key: i => [...map.keys()][i],
        get length() { return map.size; },
    };
}

test('| steps Cámara, Tenue, Negro, then every palette color, then back to Cámara', () => {
    assert.deepEqual(cycle([], 9), [BASE_DIM, BASE_BLACK, 0, 1, 2, 3, 4, BASE_CAMERA, BASE_DIM]);
});

test('the cycle skips the selected colors, so the pattern never vanishes into its base', () => {
    assert.deepEqual(cycle([2, 0], 6), [BASE_DIM, BASE_BLACK, 1, 3, 4, BASE_CAMERA]);
    assert.equal(nextBase(1, [1, 3]), 2, 'a base selected since it was picked moves on to the next free color');
    assert.equal(nextBase(4, [0, 1, 2, 3, 4]), BASE_CAMERA);
});

test('a palette base that becomes selected shows as Cámara until it is free again', () => {
    assert.equal(effectiveBase(3, [3]), BASE_CAMERA);
    assert.equal(effectiveBase(3, [1]), 3);
    assert.equal(effectiveBase(BASE_BLACK, [1]), BASE_BLACK);
});

test('the base names read Cámara, Tenue, Negro and the palette words', () => {
    assert.deepEqual([BASE_CAMERA, BASE_DIM, BASE_BLACK, 0, 4].map(baseName), ['Cámara', 'Tenue', 'Negro', 'Yellow', 'Purple']);
});

test('the | key cycles the base and leaves the selected colors alone; Shift+| resets to Cámara', () => {
    const app = stageApp();
    app.toggleColor(1);
    resolveShortcut(PIPE)(app);
    resolveShortcut(PIPE)(app);
    resolveShortcut(PIPE)(app);
    assert.equal(app.baseColor, 0);
    assert.deepEqual(app.sequencer.selectedColors, [1], 'Empty is no longer an entry in the color list');
    resolveShortcut(PIPE)(app);
    assert.equal(app.baseColor, 2, 'the selected Blue is skipped');
    resolveShortcut(SHIFT_PIPE)(app);
    assert.equal(app.baseColor, BASE_CAMERA);
    assert.deepEqual(app.sequencer.selectedColors, [1]);
});

test('Escape keeps the base, and so does a mood', () => {
    const app = stageApp();
    resolveShortcut(PIPE)(app);
    resolveShortcut(PIPE)(app);
    assert.equal(app.baseColor, BASE_BLACK);
    resolveShortcut(ESCAPE)(app);
    assert.equal(app.baseColor, BASE_BLACK);
    app.applyMood(MOODS.peak, 'peak');
    assert.equal(app.baseColor, BASE_BLACK);
});

test('a preset saves the base and loads it back; one without it or with a bad one loads Cámara', () => {
    globalThis.localStorage = memoryStorage();
    try {
        const app = stageApp();
        app.baseColor = 3;
        savePreset('with-base', app);
        assert.equal(JSON.parse(localStorage.getItem('streamlight-preset-with-base')).base, 3);
        app.baseColor = BASE_CAMERA;
        assert.equal(loadPreset('with-base', app), true);
        assert.equal(app.baseColor, 3);

        localStorage.setItem('streamlight-preset-old', JSON.stringify({ colors: { ...CONFIG.colors } }));
        assert.equal(loadPreset('old', app), true);
        assert.equal(app.baseColor, BASE_CAMERA);

        app.baseColor = BASE_DIM;
        localStorage.setItem('streamlight-preset-bad', JSON.stringify({ base: 'white' }));
        assert.equal(loadPreset('bad', app), true);
        assert.equal(app.baseColor, BASE_CAMERA);
        assert.equal(restoreBase(7), BASE_CAMERA);
        assert.equal(restoreBase(BASE_BLACK), BASE_BLACK);
    } finally {
        delete globalThis.localStorage;
    }
});

test('Reset to Defaults returns the base to Cámara', () => {
    const app = stageApp();
    app.baseColor = BASE_BLACK;
    resetToDefaults(app, memoryStorage());
    assert.equal(app.baseColor, BASE_CAMERA);
});

test('-1 columns take the base: untinted camera, the lit color dimmed, near-black, a palette color', () => {
    const colors = { ...CONFIG.colors };
    const order = CONFIG.colorOrder;
    const frame = [2, -1, -1, -1, -1];
    const lit = { colorName: 'RED', tint: colors.RED };
    assert.deepEqual(frameLooks(frame, [2], BASE_CAMERA, colors, order), [lit, NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL]);
    assert.deepEqual(frameLooks(frame, [2], BASE_DIM, colors, order)[1], { colorName: 'NEUTRAL', tint: 0x400000 });
    assert.deepEqual(frameLooks(frame, [2], BASE_BLACK, colors, order)[4], { colorName: 'NEUTRAL', tint: BLACK_TINT });
    assert.deepEqual(frameLooks(frame, [2], 1, colors, order)[3], { colorName: 'BLUE', tint: colors.BLUE });
    assert.deepEqual(frameLooks(frame, [2], BASE_DIM, colors, order)[0], lit, 'a lit column is never touched by the base');
});

test('Tenue dims the first selected color that is lit, else the first selected one', () => {
    const colors = { ...CONFIG.colors, YELLOW: 0xFFFF00, GREEN: 0x00FF00 };
    const order = CONFIG.colorOrder;
    assert.equal(unlitTint(BASE_DIM, [3, 0, -1, -1, -1], [0, 3], colors, order), 0x404000, 'both lit: Yellow, selected first');
    assert.equal(unlitTint(BASE_DIM, [3, -1, -1, -1, -1], [0, 3], colors, order), 0x004000, 'only Green lit');
    assert.equal(unlitTint(BASE_DIM, [-1, -1, -1, -1, -1], [3, 0], colors, order), 0x004000, 'nothing lit: first selected');
    assert.equal(unlitTint(BASE_CAMERA, [3, -1, -1, -1, -1], [3], colors, order), null);
});

test('with no colors selected the stage stays on the camera whatever the base', () => {
    const empty = [-1, -1, -1, -1, -1];
    for (const base of [BASE_DIM, BASE_BLACK, 0]) {
        assert.deepEqual(frameLooks(empty, [], base, CONFIG.colors, CONFIG.colorOrder), empty.map(() => NEUTRAL));
    }
});

test('the app paints each frame through the base it holds', () => {
    const app = stageApp();
    const painted = [];
    app.columnManager = { paint: looks => painted.push(looks) };
    app.sequencer.onFrameChange(frame => app._applyColorFrame(frame));
    app.toggleColor(4);
    app.setPattern('chase');
    resolveShortcut(PIPE)(app);
    resolveShortcut(PIPE)(app);
    const last = painted.at(-1);
    assert.deepEqual(last[0], { colorName: 'PURPLE', tint: CONFIG.colors.PURPLE });
    assert.deepEqual(last.slice(1), new Array(4).fill({ colorName: 'NEUTRAL', tint: BLACK_TINT }));
});
