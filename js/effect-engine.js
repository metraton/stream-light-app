// --- Effect Engine: per-column movement from the playing effect ---
import { SequencePlayer } from './tempo.js';

export class EffectEngine extends SequencePlayer {
    get activeName() {
        return this.active ? this.active.name.toUpperCase() : 'NONE';
    }

    /**
     * Per-column movement at `beat`: { offsetX, offsetY, scaleY, scale }, or null
     * when no effect plays. scale is null unless a uniform scale about the
     * column's center plays (Golpe de zoom). Pixel values are 1080p references
     * scaled by scaleFactor; every value is multiplied by the effect's intensity.
     */
    compute(columnCount, scaleFactor, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const { def, intensity } = this.active;
        const { axis = 'y' } = def;
        const blend = (a = 0, b = 0) => (a + (b - a) * weight) * intensity;

        const offsetX = new Array(columnCount).fill(0);
        const offsetY = new Array(columnCount).fill(0);
        const scaleY = new Array(columnCount).fill(0);
        let scale = null;
        if (axis === 'scale') {
            // A one-phase sequence: every step starts at the full punch and its easing carries it to rest.
            scale = new Array(columnCount).fill(from * (1 - weight) * intensity);
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
        return { offsetX, offsetY, scaleY, scale };
    }
}
