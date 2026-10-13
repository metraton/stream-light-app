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

/** Congelado: a frozen panel is shown at this fraction of its brightness for as long as it is held. */
export const FREEZE_DIM = 0.85;

/** `tint` (0xRRGGBB) with every channel scaled by `level`. */
export function scaleTint(tint, level) {
    const channel = shift => Math.round(((tint >> shift) & 0xFF) * level);
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Desfase keeps frames at least this many ms apart, so a delay in ms needs the same ring at 30 fps and above. */
export const CAPTURE_MS = 1000 / 30;

/** The most frames Desfase keeps for one column; it bounds memory at any frame rate. */
export const MAX_RING_FRAMES = 20;

/** Desfase: per column, how many delay steps it sits behind live; 'ltr' grows
 *  rightward from a live column 0, 'center' outward from a live center. */
export function delayRanks(columnCount, direction) {
    const center = (columnCount - 1) / 2;
    return Array.from({ length: columnCount }, (_, i) => (direction === 'center' ? Math.abs(i - center) : i));
}

/** Ms between kept frames: CAPTURE_MS, or the frame time (to 10 ms) when frames arrive slower than that. */
export function captureInterval(frameMs) {
    return Math.max(CAPTURE_MS, Math.round(frameMs / 10) * 10);
}

/** Per column, the ring that holds its deepest delay (`capsMs`) at one frame per
 *  `interval` ms plus the newest frame, capped at MAX_RING_FRAMES; a live column keeps none. */
export function ringLengths(capsMs, interval) {
    return capsMs.map(cap => (cap === 0 ? 0 : Math.min(MAX_RING_FRAMES, Math.ceil(cap / interval) + 1)));
}

/** The slot of a ring of `length` that frame number `frame` is written to. */
export function ringWriteSlot(frame, length) {
    return frame % length;
}

/** The capture times of Desfase's kept frames, numbered from 0, and the frame
 *  rate they arrive at. Every column's ring keeps the same frames; a ring of
 *  `length` reaches the newest `length` of them. */
export class FrameHistory {
    constructor() {
        this.frameMs = CAPTURE_MS;
        this.lastSeen = null;
        this.clear();
    }

    /** Forget the kept frames, not the measured frame rate. */
    clear() {
        this.newest = -1;
        this.stamps = [];
        this.lastKept = -Infinity;
    }

    /** Note a frame rendered at `now` (ms) in the running frame time. */
    observe(now) {
        if (this.lastSeen !== null) this.frameMs += (now - this.lastSeen - this.frameMs) * 0.2;
        this.lastSeen = now;
    }

    get interval() {
        return captureInterval(this.frameMs);
    }

    /** Keep the frame at `now` unless the last kept one is more than half a frame short of an interval old, so
     *  the kept frames are never closer than the interval a ring was sized for; returns its number or null. */
    capture(now) {
        if (now - this.lastKept < this.interval - this.frameMs / 2) return null;
        this.lastKept = now;
        this.newest++;
        this.stamps[this.newest % MAX_RING_FRAMES] = now;
        return this.newest;
    }

    /** The kept frame, within a ring of `length`, whose age at `now` is closest to `delayMs`. */
    frameFor(length, delayMs, now) {
        const oldest = Math.max(0, this.newest - (length - 1));
        let best = this.newest;
        let bestError = Infinity;
        for (let frame = this.newest; frame >= oldest; frame--) {
            const error = Math.abs(now - this.stamps[frame % MAX_RING_FRAMES] - delayMs);
            if (error > bestError) break;
            best = frame;
            bestError = error;
        }
        return best;
    }
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
     * delay, delayCap }, or null when no effect plays. The last four are null
     * unless their movement plays: scale, a uniform scale about the column's
     * center (Golpe de zoom); frozen, the step whose frame a column holds or null
     * while live (Congelado); delay, how many ms back a column shows, and
     * delayCap, the most it can ask for at the top intensity (Desfase).
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
        let delayCap = null;
        if (axis === 'scale') {
            // A one-phase sequence: every step starts at the full punch and its easing carries it to rest.
            scale = new Array(columnCount).fill(from * (1 - weight) * intensity);
        } else if (axis === 'freeze') {
            frozen = frozenSteps(phase.stepAt(beat), columnCount, option, Math.min(1, from * intensity));
        } else if (axis === 'delay') {
            const step = Math.min(def.maxStep, blend(from, to));
            const ranks = delayRanks(columnCount, option);
            delay = ranks.map(rank => rank * step);
            delayCap = ranks.map(rank => rank * def.maxStep);
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
        return { offsetX, offsetY, scaleY, scale, frozen, delay, delayCap };
    }
}
