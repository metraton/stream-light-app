// --- Scene states: the base state and the moods (single source of truth) ---
// A scene state sets every performance layer at once: colors, pattern,
// movement, glow and BPM. Startup, Escape, the cue baseline and Reset to
// Defaults all return to BASE_STATE; the keyboard (shortcuts.js) and the panel
// (sequencer-controls.js) both read the mood list from here.
//
// Colors are sequencer indices: -1=Empty, 0=Yellow, 1=Blue, 2=Red, 3=Green,
// 4=Purple. Pattern, movement and glow names must match the button modes
// (color-sequencer.js PATTERNS, effects.js, glow-map.js), or the button that a
// mood turns on never highlights.

export const BASE_STATE = Object.freeze({
    colors: Object.freeze([]),
    pattern: 'none',
    movement: 'none',
    glow: 'none',
    mood: null,
    bpm: 120,
    playing: true,
});

// A mood's speed is its BPM plus one rate per layer, in steps per beat from
// the rate buttons (tempo.js RATES); applying a mood does not change the rate
// an effect is remembered with.
export const MOODS = {
    calm:    { colors: [1],             pattern: 'none',     movement: 'wave',      glow: 'breathe',   bpm: 80,
               rates: { color: 1, movement: 0.5, glow: 0.25 } },
    build:   { colors: [2, 0],          pattern: 'fill',     movement: 'broken',    glow: 'sweep',     bpm: 130,
               rates: { color: 2, movement: 1, glow: 2 } },
    tension: { colors: [2, 4],          pattern: 'mirror',   movement: 'shake',     glow: 'pulse',     bpm: 140,
               rates: { color: 1, movement: 2, glow: 2 } },
    peak:    { colors: [0, 1, 2, 3, 4], pattern: 'carousel', movement: 'expand',    glow: 'alternate', bpm: 175,
               rates: { color: 1, movement: 1, glow: 2 } },
    mystic:  { colors: [4],             pattern: 'none',     movement: 'equalizer', glow: 'sweep',     bpm: 85,
               rates: { color: 1, movement: 1, glow: 0.5 } },
};

/** Mood keys in panel order; each is pressed with Shift. mood null is None, which clears the active mood. */
export const MOOD_QUICK = [
    { key: 'z', mood: null,      label: 'None' },
    { key: 'x', mood: 'calm',    label: 'Calm' },
    { key: 'c', mood: 'build',   label: 'Build' },
    { key: 'v', mood: 'tension', label: 'Tension' },
    { key: 'b', mood: 'peak',    label: 'Peak' },
    { key: 'n', mood: 'mystic',  label: 'Mystic' },
];

/** key (lowercase letter) -> mood name, or null for None. */
export const MOOD_KEY_TO_NAME = Object.fromEntries(
    MOOD_QUICK.map(({ key, mood }) => [key, mood])
);
