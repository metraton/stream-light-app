// --- Stage layout: where the columns sit and how the camera frame is cropped into them ---

/**
 * Column positions on the stage and the camera crop of each, from the stage size, the layout fields
 * (count, gap, margin, rotationSteps, zoom, spread) and the frame's native size. The window and the
 * camera's resolution play no part: a frame's size only matters through its aspect ratio.
 */
export function computeStageLayout({ stageWidth, stageHeight, layout, videoWidth, videoHeight }) {
    const { count, gap, margin, rotationSteps, zoom, spread } = layout;
    const columnWidth = (stageWidth - 2 * margin - (count - 1) * gap) / count;
    const columnHeight = stageHeight - 2 * margin;

    // Odd quarter turns (90, 270 degrees) swap the feed's effective width and height.
    const quarterTurns = ((rotationSteps % 4) + 4) % 4;
    const swap = quarterTurns === 1 || quarterTurns === 3;
    const effectiveWidth = swap ? videoHeight : videoWidth;
    const effectiveHeight = swap ? videoWidth : videoHeight;

    const scale = (columnHeight / effectiveHeight) * zoom;
    const scaledWidth = effectiveWidth * scale;
    const maxPan = scaledWidth - columnWidth;
    const cropStep = maxPan > 0 ? (maxPan * spread) / (count - 1) : 0;
    const startOffset = (maxPan - cropStep * (count - 1)) / 2;

    return {
        columnWidth,
        columnHeight,
        scale,
        scaledWidth,
        columnXs: Array.from({ length: count }, (_, i) => margin + i * (columnWidth + gap)),
        panOffsets: Array.from({ length: count }, (_, i) => startOffset + cropStep * i),
    };
}
