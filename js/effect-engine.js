// --- Effect Engine (generic phase interpolation runtime) ---
import { EASING_MAP } from './easing.js';

export class EffectEngine {
    constructor() {
        this.active = null; // { name, def, startTime }
    }

    play(name, effectDef) {
        this.active = {
            name,
            def: effectDef,
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
        return this.active ? this.active.name.toUpperCase() : 'NONE';
    }

    /**
     * Compute per-column offsets at the current time.
     * Returns { offsetX: number[], offsetY: number[] } or null if no active effect.
     * @param {number} columnCount - Number of columns
     * @param {number} scaleFactor - Viewport scale (screenHeight / 1080)
     */
    compute(columnCount, scaleFactor = 1) {
        if (!this.active) return null;

        const { def, startTime } = this.active;
        const elapsed = performance.now() - startTime;
        const { phaseDuration, sequence, phases, axis, easing, looping } = def;
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

        // Use configured easing or default to easeInOutSine
        const easingFn = EASING_MAP[easing] || EASING_MAP.easeInOutSine;
        const easedProgress = easingFn(phaseProgress);

        const currentPhaseName = sequence[phaseIndex];
        const nextPhaseName = sequence[(phaseIndex + 1) % sequence.length];
        const currentValues = phases[currentPhaseName];
        const nextValues = phases[nextPhaseName];

        // Build result based on axis
        const offsetX = new Array(columnCount).fill(0);
        const offsetY = new Array(columnCount).fill(0);
        const scaleY = new Array(columnCount).fill(0);
        const targetAxis = axis || 'y';

        if (targetAxis === 'xy') {
            // Dual-axis: phase data is { x: [...], y: [...] }
            for (let i = 0; i < columnCount; i++) {
                const cx = currentValues.x[i] || 0;
                const nx = nextValues.x[i] || 0;
                offsetX[i] = (cx + (nx - cx) * easedProgress) * scaleFactor;

                const cy = currentValues.y[i] || 0;
                const ny = nextValues.y[i] || 0;
                offsetY[i] = (cy + (ny - cy) * easedProgress) * scaleFactor;
            }
        } else if (targetAxis === 'scaleY') {
            // Scale axis: values are scale offsets (e.g. -0.1 = 90%, +0.1 = 110%)
            for (let i = 0; i < Math.min(currentValues.length, columnCount); i++) {
                const c = currentValues[i] || 0;
                const n = nextValues[i] || 0;
                scaleY[i] = c + (n - c) * easedProgress;
            }
        } else {
            // Single-axis: phase data is [...]
            const values = currentValues.map((v, i) =>
                (v + (nextValues[i] - v) * easedProgress) * scaleFactor
            );
            for (let i = 0; i < Math.min(values.length, columnCount); i++) {
                if (targetAxis === 'y') {
                    offsetY[i] = values[i];
                } else {
                    offsetX[i] = values[i];
                }
            }
        }

        return { offsetX, offsetY, scaleY };
    }
}
