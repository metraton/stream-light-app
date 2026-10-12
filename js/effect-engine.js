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
     * Per-column movement at `beat`: { offsetX, offsetY, scaleY, scale, frozen },
     * or null when no effect plays. scale, a uniform scale about the column's
     * center, is null unless Golpe de zoom plays; frozen, per column the step
     * whose frame it holds or null while live, is null unless Congelado plays.
     * Pixel values are 1080p references scaled by scaleFactor; every value is
     * multiplied by the effect's intensity.
     */
    compute(columnCount, scaleFactor, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const { def: { axis = 'y' }, intensity, option, phase } = this.active;
        const blend = (a = 0, b = 0) => (a + (b - a) * weight) * intensity;

        const offsetX = new Array(columnCount).fill(0);
        const offsetY = new Array(columnCount).fill(0);
        const scaleY = new Array(columnCount).fill(0);
        let scale = null;
        let frozen = null;
        if (axis === 'scale') {
            // A one-phase sequence: every step starts at the full punch and its easing carries it to rest.
            scale = new Array(columnCount).fill(from * (1 - weight) * intensity);
        } else if (axis === 'freeze') {
            frozen = frozenSteps(phase.stepAt(beat), columnCount, option, Math.min(1, from * intensity));
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
        return { offsetX, offsetY, scaleY, scale, frozen };
    }
}
