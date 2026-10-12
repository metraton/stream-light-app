// Checks the key-9 text overlay's pure logic: saved phrases, settings restore
// for presets, fade timing, the seeded neon flicker and the key binding.
// No browser: storage is a Map. Run: node --test tests/test_text_overlay.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_PHRASE_LENGTH, PHRASES_KEY, SEED_PHRASES, FADE_MS, TEXT_SIZE,
    normalizePhrase, addPhrase, removePhrase, loadPhrases, savePhrases,
    defaultTextSettings, restoreTextSettings, fadeDuration, fadeAlpha,
    flickerEvents, flickerLevel, pulseGlow,
} from '../js/overlay-text.js';
import { resolveShortcut } from '../js/shortcuts.js';

function memoryStorage(initial = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
    };
}

const key = (k, code, mods = {}) => ({ key: k, code, shiftKey: false, ctrlKey: false, altKey: false, ...mods });

test('a phrase is trimmed, inner whitespace collapsed, and rejected when empty or too long', () => {
    assert.equal(normalizePhrase('  FLASH   LIGHT \n'), 'FLASH LIGHT');
    assert.equal(normalizePhrase('   '), null);
    assert.equal(normalizePhrase(42), null);
    assert.equal(normalizePhrase('x'.repeat(MAX_PHRASE_LENGTH)), 'x'.repeat(MAX_PHRASE_LENGTH));
    assert.equal(normalizePhrase('x'.repeat(MAX_PHRASE_LENGTH + 1)), null);
});

test('adding skips invalid phrases and duplicates regardless of case; removing ignores case', () => {
    let list = addPhrase([], ' NEON  NIGHTS ');
    assert.deepEqual(list, ['NEON NIGHTS']);
    assert.equal(addPhrase(list, 'neon nights'), list);
    assert.equal(addPhrase(list, ''), list);
    assert.equal(addPhrase(list, 'y'.repeat(MAX_PHRASE_LENGTH + 1)), list);
    list = addPhrase(list, 'DROP');
    assert.deepEqual(removePhrase(list, 'drop'), ['NEON NIGHTS']);
});

test('saved phrases start from the seeds, round-trip, and an emptied list stays empty', () => {
    const storage = memoryStorage();
    assert.deepEqual(loadPhrases(storage), SEED_PHRASES);
    savePhrases(addPhrase(loadPhrases(storage), 'ENCORE'), storage);
    assert.deepEqual(loadPhrases(storage), [...SEED_PHRASES, 'ENCORE']);
    savePhrases([], storage);
    assert.deepEqual(loadPhrases(storage), []);
});

test('corrupt stored phrases fall back to the seeds; invalid and duplicate entries are dropped', () => {
    for (const text of ['{not json', '"FLASH"', '42']) {
        assert.deepEqual(loadPhrases(memoryStorage({ [PHRASES_KEY]: text })), SEED_PHRASES, text);
    }
    const stored = JSON.stringify(['A', ' a ', '', 7, 'z'.repeat(MAX_PHRASE_LENGTH + 1), 'B']);
    assert.deepEqual(loadPhrases(memoryStorage({ [PHRASES_KEY]: stored })), ['A', 'B']);
});

test('a preset without text settings loads the defaults; invalid fields fall back one by one', () => {
    assert.deepEqual(restoreTextSettings(undefined), defaultTextSettings());
    const restored = restoreTextSettings({
        phrase: '  CANDLE LIGHT ', colorMode: 'rainbow', customColor: 0x123456,
        size: TEXT_SIZE.max + 1, band: 'yes', bandOpacity: 0.3, position: 'top', beat: 'flicker',
    });
    assert.deepEqual(restored, {
        ...defaultTextSettings(),
        phrase: 'CANDLE LIGHT', customColor: 0x123456, bandOpacity: 0.3, position: 'top', beat: 'flicker',
    });
});

test('a full fade lasts FADE_MS and a reversed one only the distance already covered', () => {
    assert.equal(FADE_MS, 250);
    assert.equal(fadeDuration(0, 1), 250);
    assert.equal(fadeDuration(1, 0), 250);
    assert.equal(fadeDuration(0.4, 0), 100);
    assert.equal(fadeAlpha(0, 1, 0, 250), 0);
    assert.equal(fadeAlpha(0, 1, 125, 250), 0.5);
    assert.equal(fadeAlpha(0, 1, 250, 250), 1);
    assert.equal(fadeAlpha(1, 0, 400, 250), 0);
    assert.equal(fadeAlpha(0.4, 0, 50, fadeDuration(0.4, 0)), 0.2);
    assert.equal(fadeAlpha(1, 1, 0, fadeDuration(1, 1)), 1);
});

test('the flicker schedule is deterministic per seed, occasional, and dims within range', () => {
    const sample = seed => Array.from({ length: 6000 }, (_, i) => flickerLevel(seed, i * 10));
    assert.deepEqual(sample(7), sample(7));
    assert.notDeepEqual(sample(7), sample(8));
    for (let w = 0; w < 200; w++) assert.deepEqual(flickerEvents(7, w), flickerEvents(7, w));

    const levels = sample(7);
    const dimmed = levels.filter(level => level < 1);
    assert.ok(dimmed.length > 0, 'a minute of flicker dims at least once');
    assert.ok(dimmed.length / levels.length < 0.15, 'the text is lit most of the time');
    assert.ok(levels.every(level => level >= 0 && level <= 1));
    for (let w = 0; w < 200; w++) {
        for (const { start, end } of flickerEvents(7, w)) assert.ok(start >= 0 && end <= 1500);
    }
});

test('Pulso al golpe peaks on the beat and settles to 1 before the next', () => {
    assert.equal(pulseGlow(4), 3);
    assert.ok(pulseGlow(4.5) < pulseGlow(4.1));
    assert.ok(Math.abs(pulseGlow(4.999) - 1) < 1e-3);
});

test('key 9 toggles the overlay; Shift, Ctrl and Alt+9 stay unbound', () => {
    let toggles = 0;
    const app = { toggleOverlay: () => { toggles++; } };
    resolveShortcut(key('9', 'Digit9'))(app);
    assert.equal(toggles, 1);
    assert.equal(resolveShortcut(key(')', 'Digit9', { shiftKey: true })), null);
    assert.equal(resolveShortcut(key('9', 'Digit9', { ctrlKey: true })), null);
    assert.equal(resolveShortcut(key('9', 'Digit9', { altKey: true })), null);
});
