// --- Keyboard Shortcuts (Sequencer layout) ---
// Numbers 1-6: toggle color selection; |: toggle Empty
// Shift+number / Shift+|: select only that color
// 0 / Shift+0: next camera (Iriun, Logitech, then any others)
// QWERT: pattern (chase/pingpong/alternate/solid/carousel)
// ASDFG: movement (none/wave/expand/broken/shake)
// Z X C V B N M , : glow (off/sweep/breathe/pulse/strobe/bounce/cascade/alternate)
//   (single source of truth: js/glow-map.js)
// Shift+ZXCVB: moods (calm/build/tension/peak/mystic)
// Backspace / Shift+Backspace: cue a new combo while the live one keeps playing
// Space: commit the cue (movement/glow/mood reset to None), else play/stop
// +/-: BPM speed
// F: fullscreen, H: HUD, P: panel

import { GLOW_KEY_TO_MODE } from './glow-map.js';
import { nextCameraId } from './camera.js';

const PATTERN_KEYS = { q: 'chase', w: 'pingpong', e: 'alternate', r: 'solid', t: 'carousel' };
const MOVEMENT_KEYS = { a: 'none', s: 'wave', d: 'expand', f: 'broken', g: 'shake', h: 'equalizer' };
// Glow quick keys come from the shared map (js/glow-map.js). Moods stay here:
// Shift+ZXCVB. The glow block below uses GLOW_KEY_TO_MODE for the no-shift case
// and MOOD_KEYS for the shift case.
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

        // --- Pipe "|" = empty color ---
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

        // --- Number 0: next camera; numbers 1-6: color selection ---
        const digitMatch = e.code.match(/^Digit(\d)$/);
        if (digitMatch && !ctrl && !alt) {
            const num = parseInt(digitMatch[1]);

            if (num === 0) {
                e.preventDefault();
                nextCameraId(app.activeCameraId).then((id) => id && app.switchCamera(id));
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

        // --- Glow (no shift): Z X C V B N M , ---  and  Moods (shift): ZXCVB ---
        // The two cases are gated SEPARATELY so Shift only fires on real mood
        // keys (ZXCVB) and never swallows Shift+N/M/comma (which have no glow on
        // shift). No-shift fires only on the shared glow map.
        const glowMode = !shift ? GLOW_KEY_TO_MODE[keyLower] : undefined;
        const moodName = shift ? MOOD_KEYS[keyLower] : undefined;
        if ((glowMode !== undefined || moodName !== undefined) && !ctrl && !alt) {
            e.preventDefault();

            if (moodName !== undefined) {
                // Moods (Shift+ZXCVB)
                const mood = MOODS[moodName];
                if (mood) {
                    app.applyMood(mood, moodName);
                    app.updateHUD();
                }
            } else {
                // Glow (no-shift quick key)
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
                app.cueReset();
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
