// --- Keyboard Shortcuts ---
// |: toggle Empty; 1-5: toggle a color; 6 / Shift+6: all 5 colors in a random order
// Shift+| / Shift+1-5: select only that color
// 9: show / hide the text overlay (fades in and out)
// 0 / Shift+0: switch camera (Iriun <-> Logitech only)
// Q W E R T Y: pattern (none/chase/carousel/mirror/fill/sparkle)
// Shift+W E R T Y: that pattern's variant (color-sequencer.js PATTERN_VARIANTS); Shift+Q is Q
// A S D F G H: movement (none/wave/expand/broken/shake/equalizer)
// Z X C V B N: glow (none/sweep/breathe/pulse/strobe/alternate), from js/glow-map.js
// Shift+Z X C V B N: mood (calm/groove/build/tension/peak/mystic), from js/mood-map.js
// <: mood None (the only key for it)
// Backspace: cue a new combo while the live one keeps playing; colors, pattern,
//   movement, glow and mood pressed meanwhile wait for Space (BPM stays live)
// Space: commit the cue (unpressed movement/glow/mood go to the base state), else pause/resume
// + / ´: BPM up / down
// Escape: back to the base state; J: HUD; P: panel
//
// resolveShortcut is the only key map: the keydown listener and the live
// bridge (js/live-bridge.js) both run it, and serve.py suppresses a key
// globally only when resolveShortcut binds it.

import { GLOW_KEY_TO_MODE } from './glow-map.js';
import { MOODS, MOOD_KEY_TO_NAME } from './mood-map.js';
import { nextCameraId } from './camera.js';

const PATTERN_KEYS = { q: 'none', w: 'chase', e: 'carousel', r: 'mirror', t: 'fill', y: 'sparkle' };
const MOVEMENT_KEYS = { a: 'none', s: 'wave', d: 'expand', f: 'broken', g: 'shake', h: 'equalizer' };

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

        if (num === 6) {
            return (app) => {
                app.sequencer.selectAllShuffled();
                app.updateHUD();
            };
        }

        // Shift+9 stays unbound, so live mode never swallows it from other programs.
        if (num === 9 && !shift) {
            return (app) => app.toggleOverlay();
        }
    }

    // Shift picks the variant and plain the normal pattern, so a repeated press never toggles.
    if (PATTERN_KEYS[keyLower] && !ctrl && !alt) {
        return (app) => {
            app.setPattern(PATTERN_KEYS[keyLower], shift);
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

    // Glow and moods share keys: without Shift a key is a glow, with Shift a mood.
    if (shift && Object.hasOwn(MOOD_KEY_TO_NAME, keyLower) && !ctrl && !alt) {
        const moodName = MOOD_KEY_TO_NAME[keyLower];
        return (app) => {
            app.applyMood(MOODS[moodName], moodName);
            app.updateHUD();
        };
    }
    if (!shift && Object.hasOwn(GLOW_KEY_TO_MODE, keyLower) && !ctrl && !alt) {
        const glowMode = GLOW_KEY_TO_MODE[keyLower];
        return (app) => {
            app.setGlowMode(glowMode);
            app.updateHUD();
        };
    }

    // The cue never pauses: the live rotation keeps playing while a new combo is staged.
    if (key === 'Backspace' && !shift) {
        return (app) => app.cue();
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

    if (key === 'Escape') {
        return (app) => app.resetToBase();
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
