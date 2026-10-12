// --- Effect Engine: per-column movement from the playing effect ---
import { SequencePlayer } from './tempo.js';

/**
 * Congelado's schedule: per column, the sequence step whose frame it shows
 * frozen at step position `position`, or null while it is live. 'turns' freezes
 * column (step mod count), walking the row one column per step; 'all' freezes
 * every column. A freeze lasts the first `hold` (0-1) of its step.
 */
export function frozenSteps(position, columnCount, mode, hold) {
    const step = Math.floor(position);
    const frozen = new Array(columnCount).fill(null);
    if (position - step >= hold) return frozen;
    const turn = ((step % columnCount) + columnCount) % columnCount;
    for (let i = 0; i < columnCount; i++) {
        if (mode === 'all' || i === turn) frozen[i] = step;
    }
    return frozen;
}

/** The most frames Desfase keeps for one column: a third of a second at 60 fps. */
export const MAX_RING_FRAMES = 20;

/** Desfase: per column, how many delay steps it sits behind live; 'ltr' grows
 *  rightward from a live column 0, 'center' outward from a live center. */
export function delayRanks(columnCount, direction) {
    const center = (columnCount - 1) / 2;
    return Array.from({ length: columnCount }, (_, i) => (direction === 'center' ? Math.abs(i - center) : i));
}

/** Per column, the ring that holds its deepest delay at `maxStep` frames per
 *  rank plus the newest frame, capped at MAX_RING_FRAMES; a live column keeps none. */
export function ringLengths(ranks, maxStep) {
    return ranks.map(rank => (rank === 0 ? 0 : Math.min(MAX_RING_FRAMES, Math.ceil(rank * maxStep) + 1)));
}

/** The slot of a ring of `length` that frame number `frame` is written to. */
export function ringWriteSlot(frame, length) {
    return frame % length;
}

/** The slot holding the frame `delay` frames before `newest`, the frame just
 *  written; it reaches no further back than the ring holds or frames were written. */
export function ringReadSlot(newest, delay, length) {
    return ringWriteSlot(newest - Math.min(delay, newest, length - 1), length);
}

export class EffectEngine extends SequencePlayer {
    get activeName() {
        return this.active ? this.active.name.toUpperCase() : 'NONE';
    }

    /** As SequencePlayer.play; settings.option picks one of def.options, the first when absent. */
    play(name, def, settings, beat, lockToBeat = false) {
        super.play(name, def, settings, beat, lockToBeat);
        this.active.option = settings.option ?? def.options?.[0].value;
    }

    setOption(option) {
        if (this.active) this.active.option = option;
    }

    /**
     * Per-column movement at `beat`: { offsetX, offsetY, scaleY, scale, frozen,
     * delay, delayRings }, or null when no effect plays. The last four are null
     * unless their movement plays: scale, a uniform scale about the column's
     * center (Golpe de zoom); frozen, the step whose frame a column holds or null
     * while live (Congelado); delay, how many frames back a column shows, and
     * delayRings, the ring length each column needs for it (Desfase).
     * Pixel values are 1080p references scaled by scaleFactor; every value is
     * multiplied by the effect's intensity.
     */
    compute(columnCount, scaleFactor, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const { def, intensity, option, phase } = this.active;
        const { axis = 'y' } = def;
        const blend = (a = 0, b = 0) => (a + (b - a) * weight) * intensity;

        const offsetX = new Array(columnCount).fill(0);
        const offsetY = new Array(columnCount).fill(0);
        const scaleY = new Array(columnCount).fill(0);
        let scale = null;
        let frozen = null;
        let delay = null;
        let delayRings = null;
        if (axis === 'scale') {
            // A one-phase sequence: every step starts at the full punch and its easing carries it to rest.
            scale = new Array(columnCount).fill(from * (1 - weight) * intensity);
        } else if (axis === 'freeze') {
            frozen = frozenSteps(phase.stepAt(beat), columnCount, option, Math.min(1, from * intensity));
        } else if (axis === 'delay') {
            const step = Math.min(def.maxStep, blend(from, to));
            const ranks = delayRanks(columnCount, option);
            delay = ranks.map(rank => Math.round(rank * step));
            delayRings = ringLengths(ranks, def.maxStep);
        }
        for (let i = 0; i < columnCount; i++) {
            if (axis === 'xy') {
                offsetX[i] = blend(from.x[i], to.x[i]) * scaleFactor;
                offsetY[i] = blend(from.y[i], to.y[i]) * scaleFactor;
            } else if (axis === 'scaleY') {
                scaleY[i] = blend(from[i], to[i]);
            } else if (axis === 'x') {
                offsetX[i] = blend(from[i], to[i]) * scaleFactor;
            } else if (axis === 'y') {
                offsetY[i] = blend(from[i], to[i]) * scaleFactor;
            }
        }
        return { offsetX, offsetY, scaleY, scale, frozen, delay, delayRings };
    }
}
