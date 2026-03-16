// --- Keyboard Shortcuts (Sequencer layout) ---
// Numbers 0-6: toggle color selection
// Shift+N: select only that color
// QWERT: pattern (solid/alternate/chase/carousel/pingpong)
// ASDFG: movement (none/wave/expand/broken/shake)
// ZXCVB: glow (none/static/breathe/pulse/strobe)
// Shift+ZXCVB: moods (calm/build/tension/peak/mystic)
// Backspace: clear color selection
// Space: play/stop sequencer
// +/-: BPM speed
// F: fullscreen, H: HUD, P: panel

const PATTERN_KEYS = { q: 'solid', w: 'alternate', e: 'chase', r: 'carousel', t: 'pingpong' };
const MOVEMENT_KEYS = { a: 'none', s: 'wave', d: 'expand', f: 'broken', g: 'shake' };
const GLOW_KEYS = { z: 'none', x: 'static', c: 'breathe', v: 'pulse', b: 'strobe' };
const MOOD_KEYS = { z: 'calm', x: 'build', c: 'tension', v: 'peak', b: 'mystic' };

const MOODS = {
    calm:    { colors: [1],    pattern: 'solid',     movement: 'wave',   glow: 'breathe', bpm: 80 },
    build:   { colors: [3, 1], pattern: 'alternate',  movement: 'expand', glow: 'cascade', bpm: 110 },
    tension: { colors: [2, 4], pattern: 'chase',      movement: 'shake',  glow: 'pulse',   bpm: 150 },
    peak:    { colors: [0,1,2,3,4], pattern: 'carousel', movement: 'wave', glow: 'strobe', bpm: 180 },
    mystic:  { colors: [4, -1],pattern: 'pingpong',   movement: 'broken', glow: 'breathe', bpm: 90 },
};

export function setupShortcuts(app) {
    document.addEventListener('keydown', (e) => {
        const shift = e.shiftKey;
        const ctrl = e.ctrlKey;
        const alt = e.altKey;
        const key = e.key;
        const keyLower = key.toLowerCase();

        // Skip if typing in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // --- Pipe/backslash or 0 = empty color ---
        if ((key === '|' || key === '\\') && !ctrl && !alt) {
            e.preventDefault();
            if (shift) {
                app.sequencer.selectOnly(-1);
            } else {
                app.sequencer.toggleColor(-1);
            }
            app.updateHUD();
            return;
        }

        // --- Numbers 0-6: Color selection ---
        const digitMatch = e.code.match(/^Digit(\d)$/);
        if (digitMatch && !ctrl && !alt) {
            const num = parseInt(digitMatch[1]);

            // 0 = empty color
            if (num === 0) {
                e.preventDefault();
                if (shift) {
                    app.sequencer.selectOnly(-1);
                } else {
                    app.sequencer.toggleColor(-1);
                }
                app.updateHUD();
                return;
            }

            // 1-5 = colors (map to index 0-4)
            if (num >= 1 && num <= 5) {
                e.preventDefault();
                const colorIdx = num - 1;
                if (shift) {
                    app.sequencer.selectOnly(colorIdx);
                } else {
                    app.sequencer.toggleColor(colorIdx);
                }
                app.updateHUD();
                return;
            }

            // 6 = rainbow (all 5)
            if (num === 6) {
                e.preventDefault();
                if (shift) {
                    app.sequencer.selectOnly(0);
                    app.sequencer.selectedColors = [0, 1, 2, 3, 4];
                    app.sequencer._regenerate();
                } else {
                    app.sequencer.selectRainbow();
                }
                app.updateHUD();
                return;
            }
        }

        // --- QWERT: Pattern selection ---
        if (PATTERN_KEYS[keyLower] && !ctrl && !alt && !shift) {
            e.preventDefault();
            app.sequencer.setPattern(PATTERN_KEYS[keyLower]);
            app.updateHUD();
            return;
        }

        // --- ASDFG: Movement selection ---
        if (MOVEMENT_KEYS[keyLower] && !ctrl && !alt && !shift) {
            e.preventDefault();
            const movement = MOVEMENT_KEYS[keyLower];
            if (movement === 'none') {
                app.stopEffect();
            } else {
                // Play movement effect with current color context
                app.playMovement(movement);
            }
            app.updateHUD();
            return;
        }

        // --- ZXCVB: Glow (no shift) or Moods (shift) ---
        if (GLOW_KEYS[keyLower] !== undefined && !ctrl && !alt) {
            e.preventDefault();

            if (shift) {
                // Moods
                const moodName = MOOD_KEYS[keyLower];
                const mood = MOODS[moodName];
                if (mood) {
                    app.applyMood(mood);
                    app.updateHUD();
                }
            } else {
                // Glow
                const glowMode = GLOW_KEYS[keyLower];
                app.setGlowMode(glowMode);
                app.updateHUD();
            }
            return;
        }

        // --- Backspace: Clear color selection ---
        if (key === 'Backspace') {
            e.preventDefault();
            app.sequencer.clearColors();
            app.updateHUD();
            return;
        }

        // --- Space: Play/Stop sequencer ---
        if (key === ' ') {
            e.preventDefault();
            app.sequencer.togglePlay();
            app.updateHUD();
            return;
        }

        // --- Escape: Full reset ---
        if (key === 'Escape') {
            e.preventDefault();
            app.sequencer.clearColors();
            app.sequencer.setPattern(null);
            app.stopEffect();
            app.stopGlowEffect();
            app.updateHUD();
            return;
        }

        // --- +/- : BPM ---
        if (key === '+' || key === '=') {
            e.preventDefault();
            app.sequencer.setBPM(app.sequencer.bpm + 10);
            app.updateHUD();
            return;
        }
        if (key === '-') {
            e.preventDefault();
            app.sequencer.setBPM(app.sequencer.bpm - 10);
            app.updateHUD();
            return;
        }

        // --- Utility keys ---
        switch (keyLower) {
            case 'f':
                if (!ctrl) { e.preventDefault(); app.toggleFullscreen(); }
                break;
            case 'h':
                e.preventDefault(); app.toggleHUD();
                break;
            case 'p':
                e.preventDefault(); app.togglePanel();
                break;
        }
    });
}
