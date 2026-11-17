// --- Tempo: the master beat clock and the beat-driven sequence player ---
// BPM is the only tempo. Every layer advances `rate` sequence steps per beat and
// sits at step = beat * rate + offset with a whole-number offset, so every step
// boundary falls on the beat grid counted from the last downbeat (a color press).
import { EASING_MAP } from './easing.js';

/** The rate buttons, in sequence steps per beat. */
export const RATES = [0.25, 0.5, 1, 2, 4];
export const RATE_LABELS = new Map([[0.25, '4 golpes'], [0.5, '2 golpes'], [1, '1 golpe'], [2, '½'], [4, '¼']]);

export const BPM_MIN = 60;
export const BPM_MAX = 200;

/** The nearest whole BPM within BPM_MIN-BPM_MAX. */
export function clampBPM(bpm) {
    return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));
}

/** Beat position as a continuous function of time in ms. */
export class BeatClock {
    constructor(bpm, now) {
        this.bpm = clampBPM(bpm);
        this._anchorBeat = 0;
        this._anchorTime = now;
    }

    beatAt(now) {
        return this._anchorBeat + (now - this._anchorTime) * this.bpm / 60000;
    }

    /** Change tempo at `now` without moving the beat position. */
    setBPM(bpm, now) {
        this._anchorBeat = this.beatAt(now);
        this._anchorTime = now;
        this.bpm = clampBPM(bpm);
    }

    /** Make `now` beat 0, keeping the tempo. */
    downbeat(now) {
        this._anchorBeat = 0;
        this._anchorTime = now;
    }
}

/** A layer's position in sequence steps, advancing `rate` steps per beat. */
export class LayerPhase {
    constructor(rate) {
        this.rate = rate;
        this.offset = 0;
    }

    stepAt(beat) {
        return beat * this.rate + this.offset;
    }

    /** Make the step running at `beat` step 0, its boundaries still on the grid. */
    restartAt(beat) {
        this.offset = -Math.floor(beat * this.rate);
    }

    /** Change rate at `beat`, keeping the current whole step and the grid. */
    setRate(rate, beat) {
        const step = Math.floor(this.stepAt(beat));
        this.rate = rate;
        this.offset = step - Math.floor(beat * rate);
    }
}

/** Loops one keyframe sequence (effects.js, glow-sequences.js) against the beat.
 *  EffectEngine and GlowEngine turn its frame into offsets or intensities. */
export class SequencePlayer {
    constructor() {
        this.active = null;
    }

    /** settings is { rate, easing, intensity }. The sequence plays at once from
     *  where the beat grid puts it, so a two-step flash at rate 2 lands on every
     *  beat and every layer counts its steps from the same downbeat. */
    play(name, def, settings) {
        const phase = new LayerPhase(settings.rate);
        this.active = { name, def, phase, easing: settings.easing, intensity: settings.intensity };
    }

    stop() {
        this.active = null;
    }

    restartAt(beat) {
        this.active?.phase.restartAt(beat);
    }

    get isPlaying() {
        return this.active !== null;
    }

    setRate(rate, beat) {
        this.active?.phase.setRate(rate, beat);
    }

    setEasing(easing) {
        if (this.active) this.active.easing = easing;
    }

    setIntensity(intensity) {
        if (this.active) this.active.intensity = intensity;
    }

    /** The keyframes around `beat` and the eased weight that blends them.
     *  easing is one curve name, or an array with one curve per sequence step. */
    frameAt(beat) {
        const { def: { sequence, phases }, phase, easing } = this.active;
        const length = sequence.length;
        const position = ((phase.stepAt(beat) % length) + length) % length;
        const index = Math.floor(position);
        const curve = Array.isArray(easing) ? easing[index % easing.length] : easing;
        const ease = EASING_MAP[curve] || EASING_MAP.easeInOutSine;
        return {
            from: phases[sequence[index]],
            to: phases[sequence[(index + 1) % length]],
            weight: ease(position - index),
        };
    }
}
