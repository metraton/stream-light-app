// Checks the Color panel math: global value, per-color offsets, multi-select
// edits, clearing an offset and the conversion of old presets.
// Run: node --test tests/test_color_filter.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    NEUTRAL_FILTER, GLOBAL_SELECTION, createColorFilter, effectiveFilter, isNeutral,
    readSelection, writeSelection, hasOffset, clearOffset, migrateLegacyFilters, restoreColorFilter,
} from '../js/color-filter.js';

const UNCOLORED = -1;

test('a new model is neutral for every color and for uncolored columns', () => {
    const model = createColorFilter();
    for (const slot of [UNCOLORED, 0, 1, 2, 3, 4]) {
        assert.deepEqual(effectiveFilter(model, slot), { ...NEUTRAL_FILTER });
        assert.ok(isNeutral(effectiveFilter(model, slot)));
    }
});

test('global only: every color and uncolored columns get the global value', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'brightness', 12);
    writeSelection(model, GLOBAL_SELECTION, 'contrast', 1.2);
    for (const slot of [UNCOLORED, 0, 1, 2, 3, 4]) {
        assert.equal(effectiveFilter(model, slot).brightness, 12);
        assert.equal(effectiveFilter(model, slot).contrast, 1.2);
        assert.ok(!isNeutral(effectiveFilter(model, slot)));
    }
    assert.equal(readSelection(model, GLOBAL_SELECTION, 'brightness'), 12);
    assert.ok([0, 1, 2, 3, 4].every(slot => !hasOffset(model, slot)));
});

test('global plus offset: a color edit is stored relative to global and follows later global moves', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'contrast', 1.1);
    writeSelection(model, [2], 'contrast', 1.3);
    assert.equal(model.offsets[2].contrast, 0.2);
    assert.equal(effectiveFilter(model, 2).contrast, 1.3);
    assert.equal(effectiveFilter(model, 1).contrast, 1.1);
    assert.equal(effectiveFilter(model, UNCOLORED).contrast, 1.1);
    assert.ok(hasOffset(model, 2) && !hasOffset(model, 1));

    writeSelection(model, GLOBAL_SELECTION, 'contrast', 1.0);
    assert.equal(effectiveFilter(model, 2).contrast, 1.2);
    assert.equal(readSelection(model, [2], 'contrast'), 1.2);
});

test('effective values are clamped to the slider range', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'brightness', 25);
    writeSelection(model, [0], 'brightness', 30);
    writeSelection(model, GLOBAL_SELECTION, 'brightness', 28);
    assert.equal(effectiveFilter(model, 0).brightness, 30);
});

test('multi-select: one move gives every selected color that value and leaves the rest', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'hue', 10);
    writeSelection(model, [0], 'hue', 40);
    const selection = [3, 0, 4];
    assert.equal(readSelection(model, selection, 'hue'), 10, 'shows the first selected color');
    writeSelection(model, selection, 'hue', -20);
    for (const slot of selection) {
        assert.equal(effectiveFilter(model, slot).hue, -20);
        assert.equal(model.offsets[slot].hue, -30);
    }
    assert.equal(effectiveFilter(model, 1).hue, 10);
    assert.equal(effectiveFilter(model, 2).hue, 10);
    assert.equal(model.global.hue, 10);
});

test('clearing an offset returns that color to the global value only', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'saturation', 1.4);
    writeSelection(model, [1, 2], 'saturation', 0.6);
    writeSelection(model, [1], 'temperature', 20);
    clearOffset(model, 1);
    assert.ok(!hasOffset(model, 1));
    assert.deepEqual(effectiveFilter(model, 1), effectiveFilter(model, UNCOLORED));
    assert.equal(effectiveFilter(model, 2).saturation, 0.6);
    assert.ok(hasOffset(model, 2));
});

test('setting a color back to the global value leaves no offset (no rounding residue)', () => {
    const model = createColorFilter();
    writeSelection(model, GLOBAL_SELECTION, 'contrast', 1.1);
    writeSelection(model, [0], 'contrast', 1.3);
    writeSelection(model, [0], 'contrast', 1.1);
    assert.ok(!hasOffset(model, 0));
});

test('old presets convert to offsets without changing any column', () => {
    const filters = {
        brightness: [10, 0, -5, 0, 0],
        contrast: [1.2, 1, 1, 0.8, 1],
        saturation: [1, 1, 1, 1, 1.5],
        hue: [0, 30, 0, 0, 0],
        temperature: [0, 0, 0, 0, -40],
    };
    const fromPreset = migrateLegacyFilters(filters);
    assert.deepEqual(fromPreset.global, { ...NEUTRAL_FILTER });
    assert.equal(fromPreset.offsets[0].contrast, 0.2);
    assert.ok(hasOffset(fromPreset, 1), 'a slot that differed from neutral shows the dot');

    const neutral = { brightness: 5, contrast: 1.1, saturation: 1, hue: 0, temperature: 10 };
    const fromState = migrateLegacyFilters(filters, neutral);
    assert.deepEqual(fromState.global, neutral);
    for (const model of [fromPreset, fromState]) {
        for (let slot = 0; slot < 5; slot++) {
            for (const key of Object.keys(filters)) {
                assert.equal(effectiveFilter(model, slot)[key], filters[key][slot], `${key} slot ${slot}`);
            }
        }
    }
    assert.deepEqual(effectiveFilter(fromState, UNCOLORED), neutral);
});

test('restoring persisted data keeps finite numbers and drops the rest', () => {
    const restored = restoreColorFilter({ global: { brightness: 4, hue: 'x' }, offsets: [{ contrast: 0.1 }, null] });
    assert.equal(restored.global.brightness, 4);
    assert.equal(restored.global.hue, 0);
    assert.equal(restored.offsets[0].contrast, 0.1);
    assert.equal(restored.offsets.length, 5);
    assert.ok(!hasOffset(restored, 1));
});
