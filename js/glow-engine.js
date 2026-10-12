// --- Glow Engine: per-column glow intensity [0-1] from the playing sequence ---
import { SequencePlayer } from './tempo.js';

export class GlowEngine extends SequencePlayer {
    get activeName() {
        return this.active ? this.active.name : null;
    }

    /** Per-column intensities at `beat`: { intensity }, or null when no sequence plays. */
    compute(columnCount, beat) {
        if (!this.active) return null;
        const { from, to, weight } = this.frameAt(beat);
        const intensity = Array.from({ length: columnCount }, (_, i) => {
            const a = from[i] ?? 0;
            const b = to[i] ?? 0;
            return a + (b - a) * weight;
        });
        return { intensity };
    }
}
