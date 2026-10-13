// --- Color Sequencer: pattern-based color cycling for columns ---
// Owns the selected colors, the pattern and the master tempo (BPM), turns the
// colors into frames (one color index per column) and steps through the frames
// at the pattern's rate. Independent of the movement and glow layers, which
// read the beat from here.

import { CONFIG } from './config.js';
import { BASE_STATE } from './mood-map.js';
import { BeatClock, LayerPhase } from './tempo.js';

// Color indices: -1=empty (neutral column), 0=YELLOW, 1=BLUE, 2=RED, 3=GREEN, 4=PURPLE
const COLOR_NAMES = ['YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE'];
const EMPTY = -1;
const COLUMN_COUNT = 5;
const CENTER_COLUMN = Math.floor(COLUMN_COUNT / 2);
const SPARKLE_FRAME_COUNT = 16;

/** Pattern names in key order (Q W E R T Y). */
export const PATTERNS = ['none', 'chase', 'carousel', 'mirror', 'fill', 'sparkle'];

/** Default rate of each pattern in frames per beat (js/tempo.js), chosen at 120 BPM. */
export const PATTERN_RATES = Object.freeze({ none: 1, chase: 2, carousel: 1, mirror: 1, fill: 2, sparkle: 1 });

/** The variant each pattern plays with Shift (a variant shares its pattern's rate); none has no variant. */
export const PATTERN_VARIANTS = Object.freeze({
    chase: 'negative', carousel: 'reversed', mirror: 'negative', fill: 'negative', sparkle: 'negative',
});

// Removed pattern names mapped to the pattern that now plays instead, so an
// old name arriving from stored or relayed state still resolves.
const LEGACY_PATTERNS = { solid: 'none', pingpong: 'chase', alternate: 'carousel' };

/** Returns the current name for a pattern, translating removed names. */
export function canonicalPattern(name) {
    return LEGACY_PATTERNS[name] ?? name;
}

/** Whether a pattern has a Shift variant. */
export function hasVariant(pattern) {
    return Object.hasOwn(PATTERN_VARIANTS, canonicalPattern(pattern));
}

/** Returns the frames a pattern, or its variant, produces for an ordered color list; [] when no color is selected. */
export function generateFrames(pattern, colors, variant = false) {
    if (colors.length === 0) return [];
    const name = canonicalPattern(pattern);
    if (variant && hasVariant(name)) {
        return PATTERN_VARIANTS[name] === 'reversed'
            ? reversedFrames(normalFrames(name, colors))
            : negativeFrames(name, colors);
    }
    return normalFrames(name, colors);
}

function normalFrames(name, colors) {
    switch (name) {
        case 'chase': return chaseFrames(colors);
        case 'carousel': return carouselFrames(colors);
        case 'mirror': return mirrorFrames(colors);
        case 'sparkle': return sparkleFrames(colors);
        case 'fill': return fillFrames(colors);
        default: return solidFrames(colors);
    }
}

// negative: each selected color in turn fills the row, and the columns the
// normal pattern lights for that color alone become its Empty gaps. With one
// color this is the exact lit/Empty swap of every normal frame. Several colors
// are inverted one at a time because the normal mirror and fill (and a 5-color
// chase) light every column, so a whole-frame swap would leave the row dark.
function negativeFrames(name, colors) {
    return colors.flatMap(color =>
        normalFrames(name, [color]).map(frame => frame.map(c => (c === EMPTY ? color : EMPTY))));
}

// reversed: the normal frames played backwards from the same first frame, so
// the motion runs the other way.
function reversedFrames(frames) {
    return frames.map((_, step) => frames[(frames.length - step) % frames.length]);
}

function frameOf(colorAt) {
    return Array.from({ length: COLUMN_COUNT }, (_, col) => colorAt(col));
}

// none: each color fills the whole row as its own frame, so one color holds
// still and several blink the row from one color to the next on every step.
function solidFrames(colors) {
    return colors.map(color => frameOf(() => color));
}

// chase: the colors travel together left to right, wrapping, over empty columns.
function chaseFrames(colors) {
    return Array.from({ length: COLUMN_COUNT }, (_, offset) => {
        const frame = new Array(COLUMN_COUNT).fill(EMPTY);
        colors.forEach((color, i) => { frame[(offset + i) % COLUMN_COUNT] = color; });
        return frame;
    });
}

// carousel: the colors repeat across every column and rotate one step per beat.
// A single color has nothing to rotate against, so it alternates with empty columns.
function carouselFrames(colors) {
    const cycle = colors.length === 1 ? [colors[0], EMPTY] : colors;
    return cycle.map((_, offset) => frameOf(col => cycle[(col + offset) % cycle.length]));
}

// mirror and fill paint each color over the one before it; a single color is
// painted over empty columns, so every cycle restarts visibly.
function colorBeneath(colors, i) {
    return colors.length === 1 ? EMPTY : colors[(i - 1 + colors.length) % colors.length];
}

// mirror: each color grows from the center column out to both edges.
function mirrorFrames(colors) {
    return colors.flatMap((color, i) => {
        const beneath = colorBeneath(colors, i);
        return Array.from({ length: CENTER_COLUMN + 1 }, (_, reach) =>
            frameOf(col => (Math.abs(col - CENTER_COLUMN) <= reach ? color : beneath)));
    });
}

// fill: each color fills the row left to right, one column per beat.
function fillFrames(colors) {
    return colors.flatMap((color, i) => {
        const beneath = colorBeneath(colors, i);
        return Array.from({ length: COLUMN_COUNT }, (_, filled) =>
            frameOf(col => (col <= filled ? color : beneath)));
    });
}

/** Returns a seeded PRNG (mulberry32) yielding [0, 1): one seed, one sequence. */
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// sparkle: each beat lights 2-3 shuffled columns with random selected colors.
// The seed comes from the ordered colors, so a combo always sparkles the same way.
function sparkleFrames(colors) {
    const random = seededRandom(colors.reduce((seed, color) => seed * 7 + color + 2, 1));
    return Array.from({ length: SPARKLE_FRAME_COUNT }, () => {
        const columns = [...Array(COLUMN_COUNT).keys()];
        for (let i = columns.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [columns[i], columns[j]] = [columns[j], columns[i]];
        }
        const litCount = 2 + Math.floor(random() * 2);
        const frame = new Array(COLUMN_COUNT).fill(EMPTY);
        for (const col of columns.slice(0, litCount)) {
            frame[col] = colors[Math.floor(random() * colors.length)];
        }
        return frame;
    });
}

export class ColorSequencer {
    // Maximum number of colors that can accumulate into the combination list.
    static MAX_COMBINATIONS = 5;

    constructor() {
        this.frames = [];           // each frame is one color index per column
        this.currentStep = 0;
        this._onFrameChange = null; // callback(frame, stepIndex)
        this.clock = new BeatClock(BASE_STATE.bpm, performance.now());
        this.phase = new LayerPhase(PATTERN_RATES[BASE_STATE.pattern]);
        this._wholeStep = 0;        // floor of the phase at the last frame change
        this._ratePattern = null;   // pattern whose rate the phase currently runs at
        this.patternRates = {};     // panel-chosen rate per pattern, over PATTERN_RATES
        this.resetToBase();
    }

    /** Return to BASE_STATE: no colors, base pattern (no variant) and BPM, playing, no cue in progress. */
    resetToBase() {
        this.selectedColors = [...BASE_STATE.colors];
        this.pattern = BASE_STATE.pattern;
        this.variant = false;
        this.setBPM(BASE_STATE.bpm);
        this.isPlaying = BASE_STATE.playing;

        // --- DJ cue/staging model ---
        // While `staging` is true, color/pattern presses build a PENDING combo
        // in the background; the LIVE selectedColors/frames keep rotating
        // untouched. Play (commit) copies pending -> live and restarts from 0.
        this.staging = false;
        this.pendingColors = [];
        this.pendingPattern = BASE_STATE.pattern;
        this.pendingVariant = false;
        this.pendingFullReset = false;
        this._regenerate();
    }

    // --- Colors ---

    /** The list color presses accumulate into: pending while staging, else live. */
    get _editTarget() {
        return this.staging ? this.pendingColors : this.selectedColors;
    }

    toggleColor(colorIdx) {
        const list = this._editTarget;
        const pos = list.indexOf(colorIdx);
        if (pos !== -1) {
            list.splice(pos, 1);
        } else {
            if (list.length >= ColorSequencer.MAX_COMBINATIONS) return;
            list.push(colorIdx);
        }
        if (!this.staging) this._regenerate();
    }

    selectOnly(colorIdx) {
        if (this.staging) {
            this.pendingColors = [colorIdx];
            return;
        }
        this.selectedColors = [colorIdx];
        this._regenerate();
    }

    /** Replace the color list: the pending one while staging, else the live one. */
    setColors(colors) {
        if (this.staging) {
            this.pendingColors = [...colors];
            return;
        }
        this.selectedColors = [...colors];
        this._regenerate();
    }

    /** Todos al azar: all 5 colors in a fresh random order on every press. Only
     *  the color selection changes; the pattern, its rate and the other layers stay. */
    selectAllShuffled() {
        const colors = [0, 1, 2, 3, 4];
        for (let i = colors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colors[i], colors[j]] = [colors[j], colors[i]];
        }
        if (this.staging) {
            this.pendingColors = colors;
            return;
        }
        this.selectedColors = colors;
        this._regenerate();
    }

    // --- Staging (DJ cue) ---

    /** Begin staging a NEW combo in the background; the LIVE rotation keeps
     *  playing. fullReset asks the commit to also reset movement/glow/mood,
     *  layers the sequencer does not own, so it is returned by commitStaged(). */
    startStaging(pattern = BASE_STATE.pattern, fullReset = false) {
        this.staging = true;
        this.pendingColors = [];
        this.pendingPattern = canonicalPattern(pattern);
        this.pendingVariant = false;
        this.pendingFullReset = fullReset;
    }

    /** COMMIT the staged combo: pending -> live, regenerate, play from frame 0.
     *  @returns {object|false} false if not staging; else { fullReset }. */
    commitStaged() {
        if (!this.staging) return false;
        const fullReset = this.pendingFullReset;
        this.selectedColors = [...this.pendingColors];
        this.pattern = this.pendingPattern;
        this.variant = this.pendingVariant;
        this.staging = false;
        this.pendingFullReset = false;
        this._regenerate();
        this.play(true);
        return { fullReset };
    }

    // --- Pattern ---

    /** Select a pattern, its Shift variant when `variant` is true; a pattern
     *  without a variant (none) plays normally either way. */
    setPattern(pat, variant = false) {
        const pattern = canonicalPattern(pat);
        const withVariant = variant && hasVariant(pattern);
        if (this.staging) {
            this.pendingPattern = pattern;
            this.pendingVariant = withVariant;
            return;
        }
        this.pattern = pattern;
        this.variant = withVariant;
        this._regenerate();
    }

    // --- Tempo ---

    get bpm() {
        return this.clock.bpm;
    }

    /** Change the master tempo without moving any layer's position. */
    setBPM(bpm) {
        this.clock.setBPM(bpm, performance.now());
    }

    /** Master beat position at `now` (ms); the movement and glow layers run on it. */
    beatAt(now) {
        return this.clock.beatAt(now);
    }

    get rate() {
        return this.phase.rate;
    }

    /** Change the pattern's frames-per-beat without moving its position.
     *  remember keeps the rate for this pattern; a mood's rate is not kept. */
    setRate(rate, remember = true) {
        this.phase.setRate(rate, this.beatAt(performance.now()));
        this._ratePattern = this.pattern;
        if (remember) this.patternRates[this.pattern] = rate;
    }

    /** Run at the live pattern's rate once the pattern has changed. */
    _syncPatternRate() {
        if (this._ratePattern === this.pattern) return;
        this.setRate(this.patternRates[this.pattern] ?? PATTERN_RATES[this.pattern] ?? 1, false);
    }

    // --- Playback ---

    /** Start playback. reset=true restarts at frame 0; reset=false resumes.
     *  Playing with no colors is valid: the first color pressed moves at once. */
    play(reset = true) {
        this.isPlaying = true;
        if (reset) this.currentStep = 0;
        this._restartPhase();
        this._applyCurrentFrame();
    }

    stop() {
        this.isPlaying = false;
        this.currentStep = 0;
    }

    /** Space / Play: commit a staged combo, else toggle the live rotation. */
    togglePlay() {
        if (this.staging) {
            this.commitStaged();
            return;
        }
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play(true);
        }
    }

    /** Called every frame from the main app loop: advance one frame per whole phase step. */
    update(now) {
        if (!this.isPlaying || this.frames.length === 0) return;
        const wholeStep = Math.floor(this.phase.stepAt(this.beatAt(now)));
        if (wholeStep === this._wholeStep) return;
        this.currentStep = (this.currentStep + wholeStep - this._wholeStep) % this.frames.length;
        this._wholeStep = wholeStep;
        this._applyCurrentFrame();
    }

    /** Register callback for when frame changes */
    onFrameChange(callback) {
        this._onFrameChange = callback;
    }

    /** Rebuild the frames and paint frame 0 without changing the play state:
     *  while playing, the first colors after an empty list run from frame 0 at
     *  once; while paused, nothing moves until Space. */
    _regenerate() {
        this._syncPatternRate();
        const wasEmpty = this.frames.length === 0;
        this.currentStep = 0;
        this.frames = generateFrames(this.pattern, this.selectedColors, this.variant);
        if (this.isPlaying && wasEmpty) this._restartPhase();
        this._applyCurrentFrame();
    }

    /** Count frame steps from the current beat, so the next step is one full step away. */
    _restartPhase() {
        this.phase.restartAt(this.beatAt(performance.now()));
        this._wholeStep = 0;
    }

    _applyCurrentFrame() {
        if (this._onFrameChange) {
            this._onFrameChange(this.currentFrame, this.currentStep);
        }
    }

    // --- Helpers ---

    get currentFrame() {
        if (this.frames.length === 0) return new Array(COLUMN_COUNT).fill(EMPTY);
        return this.frames[this.currentStep % this.frames.length];
    }

    get state() {
        return {
            colors: [...this.selectedColors],
            pattern: this.pattern,
            variant: this.variant,
            bpm: this.bpm,
            isPlaying: this.isPlaying,
            frameCount: this.frames.length,
            currentStep: this.currentStep,
        };
    }

    /** Convert color index to color name */
    static colorName(idx) {
        if (idx === -1) return 'EMPTY';
        if (idx >= 0 && idx < COLOR_NAMES.length) return COLOR_NAMES[idx];
        return null;
    }

    /** Convert color index to hex value for PixiJS tint */
    static colorHex(idx) {
        if (idx === -1) return null;
        const name = COLOR_NAMES[idx];
        return name ? CONFIG.colors[name] : null;
    }
}
