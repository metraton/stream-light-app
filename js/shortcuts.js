// --- Keyboard Shortcuts (Sequencer layout) ---
// Numbers 1-6: toggle color selection; |: toggle Empty
// Shift+number / Shift+|: select only that color
// 0 / Shift+0: switch camera (Iriun <-> Logitech only)
// QWERT: pattern (chase/pingpong/alternate/solid/carousel)
// ASDFGH: movement (none/wave/expand/broken/shake/equalizer)
// Z X C V B N M , : glow (off/sweep/breathe/pulse/strobe/bounce/cascade/alternate)
//   (single source of truth: js/glow-map.js)
// Shift+ZXCVB: moods (calm/build/tension/peak/mystic)
// Backspace / Shift+Backspace: cue a new combo while the live one keeps playing
// Space: commit the cue (movement/glow/mood reset to None), else play/stop
// + / ´: BPM up / down
// <: mood None, Escape: empty reset, J: HUD, P: panel
//
// resolveShortcut is the only key map: the keydown listener and the live
// bridge (js/live-bridge.js) both run it, and serve.py suppresses a key
// globally only when resolveShortcut binds it.

import { GLOW_KEY_TO_MODE } from './glow-map.js';
import { nextCameraId } from './camera.js';

const PATTERN_KEYS = { q: 'chase', w: 'pingpong', e: 'alternate', r: 'solid', t: 'carousel' };
const MOVEMENT_KEYS = { a: 'none', s: 'wave', d: 'expand', f: 'broken', g: 'shake', h: 'equalizer' };
const MOOD_KEYS = { z: 'calm', x: 'build', c: 'tension', v: 'peak', b: 'mystic' };

const MOODS = {
    calm:    { colors: [1],         pattern: 'solid',    movement: 'wave',      glow: 'breathe',   bpm: 80 },
    build:   { colors: [2, 0],      pattern: 'carousel', movement: 'none',      glow: 'cascade',   bpm: 110 },
    tension: { colors: [2],         pattern: 'solid',    movement: 'expand',    glow: 'strobe',    bpm: 150 },
    peak:    { colors: [0,1,2,3,4], pattern: 'carousel', movement: 'wave',      glow: 'alternate', bpm: 180 },
    mystic:  { colors: [4],         pattern: 'solid',    movement: 'equalizer', glow: 'sweep',     bpm: 90 },
};

/**
 * Returns the action bound to a keystroke as `(app) => void`, or null when the
 * keystroke is unbound. `e` needs only key, code, shiftKey, ctrlKey and altKey,
 * so a KeyboardEvent and a relayed keystroke descriptor resolve identically.
 */
export function resolveShortcut(e) {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const key = e.key;
    const keyLower = key.toLowerCase();

    // On ES layout "<" is e.key '<' / e.code 'IntlBackslash'; match both.
    if ((key === '<' || e.code === 'IntlBackslash') && !ctrl && !alt) {
        return (app) => app.clearMood();
    }

    if (key === '|' && !ctrl && !alt) {
        return (app) => {
            if (shift) {
                app.sequencer.selectOnly(-1);
            } else {
                app.sequencer.toggleColor(-1);
            }
            app.updateHUD();
        };
    }

    const digitMatch = e.code.match(/^Digit(\d)$/);
    if (digitMatch && !ctrl && !alt) {
        const num = parseInt(digitMatch[1]);

        if (num === 0) {
            return (app) => nextCameraId(app.activeCameraId).then((id) => id && app.switchCamera(id));
        }

        if (num >= 1 && num <= 5) {
            const colorIdx = num - 1;
            return (app) => {
                if (shift) {
                    app.sequencer.selectOnly(colorIdx);
                } else {
                    app.sequencer.toggleColor(colorIdx);
                }
                app.updateHUD();
            };
        }

        // 6 = rainbow (all 5 colors + carousel). Shift has no distinct mode.
        if (num === 6) {
            return (app) => {
                app.sequencer.selectRainbow();
                app.updateHUD();
            };
        }
    }

    if (PATTERN_KEYS[keyLower] && !ctrl && !alt && !shift) {
        return (app) => {
            app.sequencer.setPattern(PATTERN_KEYS[keyLower]);
            app.updateHUD();
        };
    }

    if (MOVEMENT_KEYS[keyLower] && !ctrl && !alt && !shift) {
        const movement = MOVEMENT_KEYS[keyLower];
        return (app) => {
            if (movement === 'none') {
                app.stopEffect();
            } else {
                app.playMovement(movement);
            }
            app.updateHUD();
        };
    }

    // Glow and moods are gated separately so Shift fires only on real mood
    // keys (ZXCVB) and never swallows Shift+N/M/comma, which have no shift glow.
    const glowMode = !shift ? GLOW_KEY_TO_MODE[keyLower] : undefined;
    const moodName = shift ? MOOD_KEYS[keyLower] : undefined;
    if (moodName !== undefined && !ctrl && !alt) {
        return (app) => {
            app.applyMood(MOODS[moodName], moodName);
            app.updateHUD();
        };
    }
    if (glowMode !== undefined && !ctrl && !alt) {
        return (app) => {
            app.setGlowMode(glowMode);
            app.updateHUD();
        };
    }

    // Cue (DJ staging model): neither form pauses; the live rotation keeps
    // playing while a new combo is staged. Shift stages from a Solid baseline.
    if (key === 'Backspace') {
        return (app) => (shift ? app.totalReset() : app.cueReset());
    }

    if (key === ' ') {
        return (app) => {
            if (app.sequencer.staging) {
                app.commitCue();
            } else {
                app.sequencer.togglePlay();
                app.updateHUD();
            }
        };
    }

    // Empty reset: distinct from totalReset, which keeps a Solid baseline.
    if (key === 'Escape') {
        return (app) => app.emptyReset();
    }

    if (key === '+') {
        return (app) => {
            app.sequencer.setBPM(app.sequencer.bpm + 10);
            app.updateHUD();
        };
    }
    // "´" is a dead key on the Spanish layout, so keydown may report 'Dead';
    // e.code 'BracketRight' is the physical fallback.
    if ((key === '´' || key === 'Dead' || e.code === 'BracketRight') && !ctrl && !alt) {
        return (app) => {
            app.sequencer.setBPM(app.sequencer.bpm - 10);
            app.updateHUD();
        };
    }

    // F11 (fullscreen) and F12 (DevTools) stay unbound on purpose.
    if (keyLower === 'j') return (app) => app.toggleHUD();
    if (keyLower === 'p') return (app) => app.togglePanel();

    return null;
}

export function setupShortcuts(app) {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const action = resolveShortcut(e);
        if (!action) return;
        e.preventDefault();
        action(app);
    });
}
