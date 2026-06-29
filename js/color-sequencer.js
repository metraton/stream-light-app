// --- Color Sequencer: pattern-based color cycling for columns ---
// Manages selected colors, generates frames based on pattern, cycles at BPM rate.
// Independent layer from movement and glow.

import { CONFIG } from './config.js';

// Color indices: -1=empty, 0=YELLOW, 1=BLUE, 2=RED, 3=GREEN, 4=PURPLE
const COLOR_NAMES = ['YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE'];

export class ColorSequencer {
    // Maximum number of colors that can accumulate into the combination list.
    static MAX_COMBINATIONS = 5;

    constructor() {
        this.selectedColors = [];   // ordered array of color indices (-1, 0-4)
        this.pattern = 'solid';     // default at startup so 'Q Solid' shows active;
                                    // 'solid','alternate','chase','carousel','pingpong'
        this.frames = [];           // generated frames: each is [c0,c1,c2,c3,c4]
        this.currentStep = 0;
        this.bpm = 120;
        this.isPlaying = false;
        this._lastStepTime = 0;
        this._onFrameChange = null; // callback(frame, stepIndex)

        // --- DJ cue/staging model ---
        // While `staging` is true, color/pattern presses build a PENDING combo
        // in the background; the LIVE selectedColors/frames keep rotating
        // untouched. Play (commit) copies pending -> live and restarts from 0.
        this.staging = false;
        this.pendingColors = [];
        this.pendingPattern = 'solid';
        this.pendingFullReset = false;
    }

    // --- Color Selection ---

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
            // Cap at MAX_COMBINATIONS: ignore presses beyond the cap.
            if (list.length >= ColorSequencer.MAX_COMBINATIONS) return;
            list.push(colorIdx);
        }
        // While staging, only the pending buffer changes — live keeps rotating.
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

    /** REAL rainbow: all 5 colors AND the carousel pattern, which generates the
     *  cyclic-shift frames [0,1,2,3,4] -> [1,2,3,4,0] -> ... so every column shows
     *  a DISTINCT color and the rainbow marches across columns on Play.
     *  (Reuses _genCarousel — no dedicated generator needed.)
     *  Toggle: if rainbow is already active (all 5 + carousel), clear it. */
    selectRainbow() {
        if (this.staging) {
            // Stage the marching rainbow (all 5 + carousel) for the next combo.
            const allFive = this.pendingColors.length === 5 &&
                [0, 1, 2, 3, 4].every(c => this.pendingColors.includes(c));
            if (allFive && this.pendingPattern === 'carousel') {
                this.pendingColors = [];
            } else {
                this.pendingColors = [0, 1, 2, 3, 4];
                this.pendingPattern = 'carousel';
            }
            return;
        }
        const allFive = this.selectedColors.length === 5 &&
            [0, 1, 2, 3, 4].every(c => this.selectedColors.includes(c));
        if (allFive && this.pattern === 'carousel') {
            this.selectedColors = [];
        } else {
            this.selectedColors = [0, 1, 2, 3, 4];
            this.pattern = 'carousel'; // marching rainbow, not all-same-color cycling
        }
        this._regenerate();
    }

    clearColors() {
        this.selectedColors = [];
        this.isPlaying = false;
        this.staging = false;    // empty reset (Escape) exits staging too
        this.pendingColors = [];
        this._regenerate();
    }

    // --- Staging (DJ cue) ---

    /** Begin staging a NEW combo in the background. The LIVE rotation is left
     *  untouched and keeps playing. Color/pattern presses now build pending.
     *  @param {string|null} pattern - the pending pattern to start from. */
    startStaging(pattern = 'solid', fullReset = false) {
        this.staging = true;
        this.pendingColors = [];
        this.pendingPattern = pattern;
        // When true (Cue total), commit also resets movement/glow/mood to
        // baseline. The sequencer can't touch those layers itself, so it just
        // flags the intent; the app reads it via commitStaged()'s return.
        this.pendingFullReset = fullReset;
    }

    /** COMMIT the staged combo: pending -> live, regenerate, play from frame 0.
     *  @returns {object|false} false if not staging; else
     *    { fullReset } so the caller can also reset movement/glow/mood. */
    commitStaged() {
        if (!this.staging) return false;
        const fullReset = this.pendingFullReset;
        this.selectedColors = [...this.pendingColors];
        this.pattern = this.pendingPattern;
        this.staging = false;
        this.pendingFullReset = false;
        this._regenerate();   // build frames from the committed combo
        this.play(true);      // (re)start the new combo from frame 0
        return { fullReset };
    }

    // --- Pattern Selection ---

    setPattern(pat) {
        if (this.staging) {
            this.pendingPattern = pat; // stage the pattern for the next combo
            return;
        }
        this.pattern = pat;
        this._regenerate();
    }

    // --- BPM ---

    setBPM(bpm) {
        this.bpm = Math.max(40, Math.min(300, bpm));
    }

    // --- Playback ---

    /** Start playback. reset=true restarts at frame 0; reset=false resumes. */
    play(reset = true) {
        if (this.frames.length === 0) return;
        this.isPlaying = true;
        if (reset) this.currentStep = 0;
        this._lastStepTime = performance.now();
        this._applyCurrentFrame();
    }

    stop() {
        this.isPlaying = false;
        this.currentStep = 0;
    }

    /** Space / Play. In the DJ cue model:
     *  - If a combo is being STAGED, commit it (pending -> live, play from 0).
     *  - Else toggle the live rotation play/stop. */
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

    /** Called every frame from the main app loop */
    update(now) {
        if (!this.isPlaying || this.frames.length === 0) return;

        const msPerStep = (60 / this.bpm) * 1000;
        const elapsed = now - this._lastStepTime;

        if (elapsed >= msPerStep) {
            this._lastStepTime = now - (elapsed % msPerStep);
            this.currentStep = (this.currentStep + 1) % this.frames.length;
            this._applyCurrentFrame();
        }
    }

    /** Register callback for when frame changes */
    onFrameChange(callback) {
        this._onFrameChange = callback;
    }

    // --- Frame Generation ---

    _regenerate() {
        this.currentStep = 0;
        const sel = this.selectedColors.filter(c => c >= 0 && c <= 4);
        const hasEmpty = this.selectedColors.includes(-1);

        if (sel.length === 0 && !hasEmpty) {
            this.frames = [];
            this._applyCurrentFrame();
            return;
        }

        const allSel = [...this.selectedColors]; // includes -1 if selected

        switch (this.pattern) {
            case 'solid':
                this.frames = this._genSolid(allSel);
                break;
            case 'alternate':
                this.frames = this._genAlternate(allSel);
                break;
            case 'chase':
                this.frames = this._genChase(allSel);
                break;
            case 'carousel':
                this.frames = this._genCarousel(allSel);
                break;
            case 'pingpong':
                this.frames = this._genPingPong(allSel);
                break;
            default:
                // No pattern selected: just show solid first color
                if (allSel.length > 0) {
                    this.frames = this._genSolid(allSel);
                } else {
                    this.frames = [];
                }
        }

        this._applyCurrentFrame();

        // "Nothing auto-plays" model: _regenerate ONLY rebuilds frames and paints
        // the current static frame. It never starts playback. The user starts
        // cycling explicitly with SPACE (togglePlay), and a cue commit plays via
        // commitStaged's explicit play(true). If already playing when colors are
        // edited live, isPlaying stays true so the ticker keeps cycling the new
        // frames (currentStep was reset to 0 above).
    }

    _applyCurrentFrame() {
        if (this._onFrameChange) {
            const frame = this.frames.length > 0
                ? this.frames[this.currentStep % this.frames.length]
                : [-1, -1, -1, -1, -1];
            this._onFrameChange(frame, this.currentStep);
        }
    }

    // --- Pattern: Solid ---
    // Each selected color fills ALL 5 columns as its own frame
    _genSolid(sel) {
        if (sel.length === 0) return [[-1,-1,-1,-1,-1]];
        return sel.map(c => [c, c, c, c, c]);
    }

    // --- Pattern: Alternate ---
    // Each color gets its own frame with vacíos
    // First color → positions 0,2,4 (dominant, 3 cols)
    // Second color → positions 1,3 (response, 2 cols)
    // Third → 0,2,4 again, etc.
    _genAlternate(sel) {
        if (sel.length === 0) return [[-1,-1,-1,-1,-1]];
        return sel.map((color, idx) => {
            const frame = [-1, -1, -1, -1, -1];
            const positions = (idx % 2 === 0) ? [0, 2, 4] : [1, 3];
            positions.forEach(p => { frame[p] = color; });
            return frame;
        });
    }

    // --- Pattern: Chase ---
    // Colors travel together L→R, wrapping around
    _genChase(sel) {
        if (sel.length === 0) return [[-1,-1,-1,-1,-1]];
        const frames = [];
        for (let offset = 0; offset < 5; offset++) {
            const frame = [-1, -1, -1, -1, -1];
            sel.forEach((color, ci) => {
                const pos = (offset + ci) % 5;
                frame[pos] = color;
            });
            frames.push(frame);
        }
        return frames;
    }

    // --- Pattern: Carousel ---
    // All 5 columns filled, colors rotate positions
    _genCarousel(sel) {
        if (sel.length === 0) return [[-1,-1,-1,-1,-1]];
        if (sel.length === 1) return [[sel[0], sel[0], sel[0], sel[0], sel[0]]];

        const numFrames = sel.length;
        const frames = [];
        for (let offset = 0; offset < numFrames; offset++) {
            const frame = [];
            for (let i = 0; i < 5; i++) {
                frame.push(sel[(i + offset) % sel.length]);
            }
            frames.push(frame);
        }
        return frames;
    }

    // --- Pattern: Ping-Pong ---
    // Group of colors bounces left→right→left
    _genPingPong(sel) {
        if (sel.length === 0) return [[-1,-1,-1,-1,-1]];
        const groupSize = Math.min(sel.length, 5);
        const maxPos = 5 - groupSize;

        if (maxPos <= 0) {
            return [sel.slice(0, 5)];
        }

        const frames = [];
        // Forward
        for (let pos = 0; pos <= maxPos; pos++) {
            const frame = [-1, -1, -1, -1, -1];
            for (let ci = 0; ci < groupSize; ci++) {
                frame[pos + ci] = sel[ci];
            }
            frames.push(frame);
        }
        // Backward (skip endpoints)
        for (let pos = maxPos - 1; pos >= 1; pos--) {
            const frame = [-1, -1, -1, -1, -1];
            for (let ci = 0; ci < groupSize; ci++) {
                frame[pos + ci] = sel[ci];
            }
            frames.push(frame);
        }
        return frames;
    }

    // --- Helpers ---

    get currentFrame() {
        if (this.frames.length === 0) return [-1, -1, -1, -1, -1];
        return this.frames[this.currentStep % this.frames.length];
    }

    get state() {
        return {
            colors: [...this.selectedColors],
            pattern: this.pattern,
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
        if (idx === -1) return null; // empty = no tint change
        const name = COLOR_NAMES[idx];
        return name ? CONFIG.colors[name] : null;
    }
}
