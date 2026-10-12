// --- Glow Engine (phase interpolation for glow intensity) ---
// Mirrors EffectEngine but outputs per-column intensity [0-1] instead of position offsets.
import { EASING_MAP } from './easing.js';

export class GlowEngine {
    constructor() {
        this.active = null; // { name, def, startTime }
    }

    play(name, glowDef) {
        this.active = {
            name,
            def: glowDef,
            startTime: performance.now(),
        };
    }

    stop() {
        this.active = null;
    }

    get isPlaying() {
        return this.active !== null;
    }

    get activeName() {
        return this.active ? this.active.name : null;
    }

    /**
     * Compute per-column glow intensities at the current time.
     * Returns { intensity: number[] } or null if not playing.
     */
    compute(columnCount) {
        if (!this.active) return null;

        const { def, startTime } = this.active;
        const elapsed = performance.now() - startTime;
        const { phaseDuration, sequence, phases, easing, looping } = def;
        const totalDuration = sequence.length * phaseDuration;

        let time = elapsed;
        if (looping) {
            time = elapsed % totalDuration;
        } else if (elapsed >= totalDuration) {
            this.stop();
            return null;
        }

        const phaseIndex = Math.floor(time / phaseDuration);
        const phaseProgress = (time % phaseDuration) / phaseDuration;

        // easing is one curve for every phase, or an array with one curve per sequence step.
        const easingName = Array.isArray(easing) ? easing[phaseIndex] : easing;
        const easingFn = EASING_MAP[easingName] || EASING_MAP.easeInOutSine;
        const easedProgress = easingFn(phaseProgress);

        const currentPhaseName = sequence[phaseIndex];
        const nextPhaseName = sequence[(phaseIndex + 1) % sequence.length];
        const currentValues = phases[currentPhaseName];
        const nextValues = phases[nextPhaseName];

        const intensity = new Array(columnCount).fill(0);
        for (let i = 0; i < Math.min(currentValues.length, columnCount); i++) {
            const c = currentValues[i];
            const n = nextValues[i];
            intensity[i] = c + (n - c) * easedProgress;
        }

        return { intensity };
    }
}
