// --- Glow Engine: per-column glow intensity from the playing sequence ---
import { SequencePlayer } from './tempo.js';

export class GlowEngine extends SequencePlayer {
    get activeName() {
        return this.active ? this.active.name : null;
    }

    /** Per-column intensities at `beat`, scaled by the sequence's intensity
     *  (columns.js clamps them to 0-1): { intensity }, or null when no sequence plays. */
    compute(columnCount, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const scale = this.active.intensity ?? 1;
        const intensity = Array.from({ length: columnCount }, (_, i) => {
            const a = from[i] ?? 0;
            const b = to[i] ?? 0;
            return (a + (b - a) * weight) * scale;
        });
        return { intensity };
    }
}
