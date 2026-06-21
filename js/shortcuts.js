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
const MOVEMENT_KEYS = { a: 'none', s: 'wave', d: 'expand', f: 'broken', g: 'shake', h: 'equalizer' };
const GLOW_KEYS = { z: 'none', x: 'static', c: 'breathe', v: 'pulse', b: 'strobe' };
const MOOD_KEYS = { z: 'calm', x: 'build', c: 'tension', v: 'peak', b: 'mystic' };

const MOODS = {
    calm:    { colors: [1],         pattern: 'solid',    movement: 'wave',      glow: 'breathe',   bpm: 80 },
    build:   { colors: [2, 0],      pattern: 'carousel', movement: 'none',      glow: 'cascade',   bpm: 110 },
    tension: { colors: [2],         pattern: 'solid',    movement: 'expand',    glow: 'strobe',    bpm: 150 },
    peak:    { colors: [0,1,2,3,4], pattern: 'carousel', movement: 'wave',      glow: 'alternate', bpm: 180 },
    mystic:  { colors: [4],         pattern: 'solid',    movement: 'equalizer', glow: 'sweep',     bpm: 90 },
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

        // --- "<" key = Mood NONE (clears the active mood) ---
        // On ES layout "<" is e.key '<' / e.code 'IntlBackslash'; match both.
        if ((key === '<' || e.code === 'IntlBackslash') && !ctrl && !alt) {
            e.preventDefault();
            app.clearMood();
            return;
        }

        // --- Pipe "|" or 0 = empty color (empty stays reachable) ---
        if (key === '|' && !ctrl && !alt) {
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

            // 6 = REAL rainbow (all 5 colors + carousel = marching rainbow).
            // Shift is treated the same: there is no distinct "only rainbow" mode.
            if (num === 6) {
                e.preventDefault();
                app.sequencer.selectRainbow();
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
                    app.applyMood(mood, moodName);
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

        // --- Backspace = CUE; Shift+Backspace = TOTAL CUE (DJ staging model) ---
        // Neither pauses: the LIVE rotation keeps playing while a NEW combo is
        // staged in the background. Plain: pending pattern null. Shift: Solid.
        // Press Space to commit the staged combo (it then plays from frame 0).
        if (key === 'Backspace') {
            e.preventDefault();
            if (shift) {
                app.totalReset();   // start staging with Solid baseline
            } else {
                app.cueReset();     // start staging (pattern null)
            }
            return;
        }

        // --- Space: commit a staged cue, else Play/Stop the live sequencer ---
        if (key === ' ') {
            e.preventDefault();
            if (app.sequencer.staging) {
                app.commitCue();          // commit cue (+ baseline reset if Cue total)
            } else {
                app.sequencer.togglePlay();
                app.updateHUD();
            }
            return;
        }

        // --- Escape: EMPTY RESET (todo a empty) ---
        // Visibly wipes colors to neutral, Pattern=null, Movement/Glow/Mood None,
        // stopped. Distinct from totalReset (Solid baseline). Not user-paused.
        if (key === 'Escape') {
            e.preventDefault();
            app.emptyReset();
            return;
        }

        // --- BPM increase: "+" key ---
        if (key === '+') {
            e.preventDefault();
            app.sequencer.setBPM(app.sequencer.bpm + 10);
            app.updateHUD();
            return;
        }
        // --- BPM decrease: "´" acute-accent key (Spanish layout) ---
        // It is a DEAD KEY, so the keydown may arrive as e.key === 'Dead' rather
        // than '´'. Match both, plus the physical e.code 'BracketRight' (the key
        // right of P on ES-QWERTY) as a layout-independent fallback.
        if ((key === '´' || key === 'Dead' || e.code === 'BracketRight') && !ctrl && !alt) {
            e.preventDefault();
            app.sequencer.setBPM(app.sequencer.bpm - 10);
            app.updateHUD();
            return;
        }

        // Fullscreen is the browser's native F11 — intentionally NOT bound here
        // (no preventDefault), so F11 fullscreens and F12 opens DevTools normally.

        // --- Utility keys ---
        switch (keyLower) {
            case 'j':
                e.preventDefault(); app.toggleHUD();
                break;
            case 'p':
                e.preventDefault(); app.togglePanel();
                break;
        }
    });
}
