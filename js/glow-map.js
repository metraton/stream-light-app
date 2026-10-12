// --- Glow Quick-Mode Map (single source of truth) ---
// ONE ordered list drives both the keyboard handler (shortcuts.js) and the
// panel quick buttons (sequencer-controls.js), so key, label and mode cannot
// drift apart. To re-order, rename, add or remove a quick glow, edit only this
// array.
//
//   key   - the keyboard key (e.key form, lowercase) AND the glyph on the button.
//   mode  - the glow mode name passed to app.setGlowMode().
//   label - the word shown under the key on the button.
//
// Glow is no-shift: Shift+the same keys are the moods (mood-map.js).
export const GLOW_QUICK = [
    { key: 'z', mode: 'none',      label: 'None' },
    { key: 'x', mode: 'sweep',     label: 'Sweep' },
    { key: 'c', mode: 'breathe',   label: 'Breathe' },
    { key: 'v', mode: 'pulse',     label: 'Pulse' },
    { key: 'b', mode: 'strobe',    label: 'Strobe' },
    { key: 'n', mode: 'alternate', label: 'Alternate' },
];

/** key (lowercase) -> glow mode, for the keyboard handler. */
export const GLOW_KEY_TO_MODE = Object.fromEntries(
    GLOW_QUICK.map(({ key, mode }) => [key, mode])
);

/** Glow sequence (glow-sequences.js) a mode plays when its name differs from the mode. */
export const GLOW_MODE_SEQUENCE = { sweep: 'sweep-right' };

// Modes removed from the grid, and the sequence name that once stood in for
// 'sweep', mapped to the mode that now plays instead.
const LEGACY_GLOW_MODES = { bounce: 'sweep', cascade: 'sweep', 'sweep-right': 'sweep' };

/** Returns the current mode name for a glow mode, translating removed names. */
export function canonicalGlowMode(mode) {
    return LEGACY_GLOW_MODES[mode] ?? mode;
}
