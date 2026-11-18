import { CONFIG } from './config.js';

const EMPTY = -1;
export const BASE_CAMERA = 'camera';
export const BASE_DIM = 'dim';
export const BASE_BLACK = 'black';

const BASE_CYCLE = [BASE_CAMERA, BASE_DIM, BASE_BLACK, 0, 1, 2, 3, 4];
const BASE_NAMES = { [BASE_CAMERA]: 'Cámara', [BASE_DIM]: 'Tenue', [BASE_BLACK]: 'Negro' };

/** Panel words of palette slots 0-4. */
export const PALETTE_WORDS = ['Yellow', 'Blue', 'Red', 'Green', 'Purple'];

export const DIM_LEVEL = 0.25;
/** Multiplies the camera down to about 4% brightness. */
export const BLACK_TINT = 0x0A0A0A;

const CAMERA_LOOK = Object.freeze({ colorName: 'NEUTRAL', tint: 0xFFFFFF });

/** The base after `base` on `|`: the next entry of the cycle that is not a selected color. */
export function nextBase(base, selectedColors) {
    const start = BASE_CYCLE.indexOf(base);
    for (let step = 1; step < BASE_CYCLE.length; step++) {
        const candidate = BASE_CYCLE[(start + step) % BASE_CYCLE.length];
        if (!selectedColors.includes(candidate)) return candidate;
    }
    return BASE_CAMERA;
}

/** A stored base when it is one the cycle offers, else Cámara. */
export function restoreBase(value) {
    return BASE_CYCLE.includes(value) ? value : BASE_CAMERA;
}

/** The base that shows: a palette base selected since it was picked (by a mood, a key) shows as Cámara. */
export function effectiveBase(base, selectedColors) {
    return selectedColors.includes(base) ? BASE_CAMERA : base;
}

export function baseName(base) {
    return BASE_NAMES[base] ?? PALETTE_WORDS[base];
}

function scaleHex(hex, level) {
    const channel = shift => Math.round(((hex >> shift) & 0xFF) * level) << shift;
    return channel(16) | channel(8) | channel(0);
}

function firstLitSelected(frame, selectedColors) {
    return selectedColors.find(idx => frame.includes(idx)) ?? selectedColors[0] ?? null;
}

/** The tint unlit columns of `frame` show, or null for the untinted camera (always so with no color selected). */
export function unlitTint(base, frame, selectedColors, colors = CONFIG.colors, colorOrder = CONFIG.colorOrder) {
    if (selectedColors.length === 0) return null;
    const shown = effectiveBase(base, selectedColors);
    if (shown === BASE_BLACK) return BLACK_TINT;
    if (shown === BASE_DIM) {
        const source = firstLitSelected(frame, selectedColors);
        return source === null ? null : scaleHex(colors[colorOrder[source]], DIM_LEVEL);
    }
    if (Number.isInteger(shown)) return colors[colorOrder[shown]];
    return null;
}

/** { colorName, tint } per column of `frame`; colorName (filter slot) is a palette base's color, else 'NEUTRAL'. */
export function frameLooks(frame, selectedColors, base, colors = CONFIG.colors, colorOrder = CONFIG.colorOrder) {
    const shown = effectiveBase(base, selectedColors);
    const tint = unlitTint(base, frame, selectedColors, colors, colorOrder);
    let unlit = CAMERA_LOOK;
    if (tint !== null) unlit = { colorName: Number.isInteger(shown) ? colorOrder[shown] : 'NEUTRAL', tint };
    return frame.map(idx => {
        if (idx === EMPTY) return unlit;
        const colorName = colorOrder[idx];
        return colors[colorName] === undefined ? CAMERA_LOOK : { colorName, tint: colors[colorName] };
    });
}
