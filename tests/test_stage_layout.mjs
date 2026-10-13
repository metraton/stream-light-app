// Checks the stage layout: the stage is a fixed 1920x1080 that CSS scales to the window, so panel
// count, widths, gaps and proportions come from the layout fields alone, and the camera crop depends
// on the frame's aspect ratio, never on its resolution.
// Run: node --test tests/test_stage_layout.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/config.js';
import { computeStageLayout } from '../js/stage-layout.js';

const STAGE = { stageWidth: 1920, stageHeight: 1080 };
const layoutFor = (video, rotationSteps = 0) => computeStageLayout({
    ...STAGE, layout: { ...DEFAULTS.columns, rotationSteps }, videoWidth: video[0], videoHeight: video[1],
});

test('five complete panels of equal width, evenly spaced, inside the stage', () => {
    const { columnWidth, columnHeight, columnXs } = layoutFor([1280, 720]);
    const { gap, margin, count } = DEFAULTS.columns;
    assert.equal(columnXs.length, count);
    assert.equal(columnXs.length, 5);
    columnXs.forEach((x, i) => {
        assert.ok(x >= margin && x + columnWidth <= STAGE.stageWidth - margin, `panel ${i} inside`);
        if (i > 0) assert.equal(x - columnXs[i - 1] - columnWidth, gap);
    });
    assert.equal(columnXs[0], margin);
    assert.equal(STAGE.stageWidth - (columnXs[4] + columnWidth), margin);
    assert.equal(columnHeight, STAGE.stageHeight - 2 * margin);
});

test('panel proportions of the stage are the same at 1920x1080 and 1280x720 (the window only scales them)', () => {
    const { columnWidth, columnXs } = layoutFor([1280, 720]);
    for (const [viewportWidth, viewportHeight] of [[1920, 1080], [1280, 720], [1290, 726]]) {
        const displayScale = Math.min(viewportWidth / STAGE.stageWidth, viewportHeight / STAGE.stageHeight);
        const shownWidth = STAGE.stageWidth * displayScale;
        const fractions = columnXs.map(x => (x * displayScale) / shownWidth);
        const expected = columnXs.map(x => x / STAGE.stageWidth);
        fractions.forEach((fraction, i) => assert.ok(Math.abs(fraction - expected[i]) < 1e-12, `${viewportWidth}x${viewportHeight} panel ${i}`));
        assert.ok(Math.abs((columnWidth * displayScale) / shownWidth - columnWidth / STAGE.stageWidth) < 1e-12);
    }
});

test('the camera crop is the same for any resolution of one aspect ratio', () => {
    const reference = layoutFor([1280, 720]);
    for (const video of [[640, 360], [1920, 1080], [1280, 720]]) {
        const layout = layoutFor(video);
        assert.deepEqual(layout.columnXs, reference.columnXs);
        assert.equal(layout.columnWidth, reference.columnWidth);
        layout.panOffsets.forEach((pan, i) => {
            assert.ok(Math.abs(pan / layout.scaledWidth - reference.panOffsets[i] / reference.scaledWidth) < 1e-12, `${video} pan ${i}`);
        });
    }
});

test('a different aspect ratio changes the crop but never the panels', () => {
    const wide = layoutFor([1280, 720]);
    const narrow = layoutFor([640, 480]);
    assert.deepEqual(narrow.columnXs, wide.columnXs);
    assert.equal(narrow.columnWidth, wide.columnWidth);
    assert.notDeepEqual(narrow.panOffsets.map(p => p / narrow.scaledWidth), wide.panOffsets.map(p => p / wide.scaledWidth));
});

test('quarter turns swap the frame axes: a 270 degree turn crops a landscape frame like a portrait one', () => {
    assert.deepEqual(layoutFor([1280, 720], 3).panOffsets, layoutFor([720, 1280], 0).panOffsets);
    assert.deepEqual(layoutFor([1280, 720], 3).panOffsets, layoutFor([1280, 720], 1).panOffsets);
});
