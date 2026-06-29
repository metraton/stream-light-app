// --- Glow Quick-Mode Map (single source of truth) ---
// ONE ordered list that drives BOTH the keyboard handler (shortcuts.js) and the
// panel quick buttons (sequencer-controls.js), so key + label + mode can never
// drift apart again (the old split lists are what let the Sweep button lose its
// hotkey). To re-order, rename, add, or remove a quick-glow option, edit ONLY
// this array.
//
//   key   - the keyboard key (e.key form: lowercase letter, or ',') AND the
//           glyph shown on the panel button.
//   mode  - the glow mode name passed to app.setGlowMode().
//   label - the word shown under the key on the panel button.
//
// Glow is NO-SHIFT. Shift+Z/X/C/V/B remain MOODS (see shortcuts.js MOOD_KEYS),
// so this list deliberately stays on no-shift keys only.
export const GLOW_QUICK = [
    { key: 'z', mode: 'none',        label: 'Off' },
    { key: 'x', mode: 'sweep-right', label: 'Sweep' },
    { key: 'c', mode: 'breathe',     label: 'Breathe' },
    { key: 'v', mode: 'pulse',       label: 'Pulse' },
    { key: 'b', mode: 'strobe',      label: 'Strobe' },
    { key: 'n', mode: 'bounce',      label: 'Bounce' },
    { key: 'm', mode: 'cascade',     label: 'Cascade' },
    { key: ',', mode: 'alternate',   label: 'Alternate' },
];

/** key (lowercase / ',') -> glow mode, for the keyboard handler. */
export const GLOW_KEY_TO_MODE = Object.fromEntries(
    GLOW_QUICK.map(({ key, mode }) => [key, mode])
);
