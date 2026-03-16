// --- Color Sequencer: pattern-based color cycling for columns ---
// Manages selected colors, generates frames based on pattern, cycles at BPM rate.
// Independent layer from movement and glow.

import { CONFIG } from './config.js';

// Color indices: -1=empty, 0=YELLOW, 1=BLUE, 2=RED, 3=GREEN, 4=PURPLE
const COLOR_NAMES = ['YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE'];

export class ColorSequencer {
    constructor() {
        this.selectedColors = [];   // ordered array of color indices (-1, 0-4)
        this.pattern = null;        // 'solid','alternate','chase','carousel','pingpong'
        this.frames = [];           // generated frames: each is [c0,c1,c2,c3,c4]
        this.currentStep = 0;
        this.bpm = 120;
        this.isPlaying = false;
        this._lastStepTime = 0;
        this._onFrameChange = null; // callback(frame, stepIndex)
    }

    // --- Color Selection ---

    toggleColor(colorIdx) {
        const pos = this.selectedColors.indexOf(colorIdx);
        if (pos !== -1) {
            this.selectedColors.splice(pos, 1);
        } else {
            this.selectedColors.push(colorIdx);
        }
        this._regenerate();
    }

    selectOnly(colorIdx) {
        this.selectedColors = [colorIdx];
        this._regenerate();
    }

    selectRainbow() {
        // Toggle: if all 5 selected, clear; otherwise select all
        if (this.selectedColors.length === 5 &&
            [0,1,2,3,4].every(c => this.selectedColors.includes(c))) {
            this.selectedColors = [];
        } else {
            this.selectedColors = [0, 1, 2, 3, 4];
        }
        this._regenerate();
    }

    clearColors() {
        this.selectedColors = [];
        this.isPlaying = false;
        this._regenerate();
    }

    // --- Pattern Selection ---

    setPattern(pat) {
        this.pattern = pat;
        this._regenerate();
    }

    // --- BPM ---

    setBPM(bpm) {
        this.bpm = Math.max(40, Math.min(300, bpm));
    }

    // --- Playback ---

    play() {
        if (this.frames.length === 0) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this._lastStepTime = performance.now();
        this._applyCurrentFrame();
    }

    stop() {
        this.isPlaying = false;
        this.currentStep = 0;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
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

        // Auto-play if we have frames and a pattern
        if (this.frames.length > 1 && this.pattern && !this.isPlaying) {
            this.play();
        }
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
