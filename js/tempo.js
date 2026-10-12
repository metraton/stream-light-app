// --- Tempo: the master beat clock and the beat-driven sequence player ---
// BPM is the only tempo. Every layer advances `rate` sequence steps per beat and
// sits at step = beat * rate + offset, so a BPM change re-anchors the clock and
// a rate change recomputes the offset: neither moves the current position.
import { EASING_MAP } from './easing.js';

/** The rate buttons, in sequence steps per beat. */
export const RATES = [0.25, 0.5, 1, 2, 4];
export const RATE_LABELS = new Map([[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2'], [4, '4']]);

export const BPM_MIN = 40;
export const BPM_MAX = 300;

/** Beat position as a continuous function of time in ms. */
export class BeatClock {
    constructor(bpm, now) {
        this.bpm = bpm;
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
        this.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
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

    /** Put step 0 at `beat`. */
    restartAt(beat) {
        this.offset = -beat * this.rate;
    }

    /** Change rate at `beat` without moving the current step. */
    setRate(rate, beat) {
        const step = this.stepAt(beat);
        this.rate = rate;
        this.offset = step - beat * rate;
    }
}

/** Loops one keyframe sequence (effects.js, glow-sequences.js) against the beat.
 *  EffectEngine and GlowEngine turn its frame into offsets or intensities. */
export class SequencePlayer {
    constructor() {
        this.active = null;
    }

    /** settings is { rate, easing, intensity }. lockToBeat leaves step 0 on the
     *  beat grid, so a two-step flash at rate 2 lands on every beat; otherwise
     *  step 0 starts at `beat`. */
    play(name, def, settings, beat, lockToBeat = false) {
        const phase = new LayerPhase(settings.rate);
        if (!lockToBeat) phase.restartAt(beat);
        this.active = { name, def, phase, easing: settings.easing, intensity: settings.intensity };
    }

    stop() {
        this.active = null;
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
