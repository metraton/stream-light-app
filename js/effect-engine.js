// --- Effect Engine: per-column movement from the playing effect ---
import { SequencePlayer } from './tempo.js';

export class EffectEngine extends SequencePlayer {
    get activeName() {
        return this.active ? this.active.name.toUpperCase() : 'NONE';
    }

    /**
     * Per-column movement at `beat`: { offsetX, offsetY, scaleY }, or null when
     * no effect plays. Pixel values are 1080p references scaled by scaleFactor;
     * every value is multiplied by the effect's intensity.
     */
    compute(columnCount, scaleFactor, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const { def: { axis = 'y' }, intensity } = this.active;
        const blend = (a = 0, b = 0) => (a + (b - a) * weight) * intensity;

        const offsetX = new Array(columnCount).fill(0);
        const offsetY = new Array(columnCount).fill(0);
        const scaleY = new Array(columnCount).fill(0);
        for (let i = 0; i < columnCount; i++) {
            if (axis === 'xy') {
                offsetX[i] = blend(from.x[i], to.x[i]) * scaleFactor;
                offsetY[i] = blend(from.y[i], to.y[i]) * scaleFactor;
            } else if (axis === 'scaleY') {
                scaleY[i] = blend(from[i], to[i]);
            } else if (axis === 'x') {
                offsetX[i] = blend(from[i], to[i]) * scaleFactor;
            } else {
                offsetY[i] = blend(from[i], to[i]) * scaleFactor;
            }
        }
        return { offsetX, offsetY, scaleY };
    }
}
