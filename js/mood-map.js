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
// the rate buttons (tempo.js RATES). The optional `easings` sets a movement or
// glow curve, which must be a panel easing (layer-controls.js EASING_MODES) or
// its button never highlights; a layer it omits plays the effect's own curve.
// Applying a mood does not change the rate or easing an effect is remembered with.
export const MOODS = {
    calm:    { colors: [1],             pattern: 'none',     movement: 'wave',      glow: 'breathe',   bpm: 80,
               rates: { color: 1, movement: 1, glow: 0.5 } },
    groove:  { colors: [1, 3],          pattern: 'carousel', movement: 'wave',      glow: 'pulse',     bpm: 120,
               rates: { color: 1, movement: 1, glow: 1 } },
    build:   { colors: [2, 0],         pattern: 'fill',     movement: 'broken',    glow: 'sweep',     bpm: 130,
               rates: { color: 2, movement: 1, glow: 2 } },
    tension: { colors: [2, 4],          pattern: 'mirror',   movement: 'shake',     glow: 'pulse',     bpm: 140,
               rates: { color: 1, movement: 2, glow: 4 },
               easings: { glow: 'easeInOutCubic' } },
    peak:    { colors: [0, 1, 2, 3, 4], pattern: 'carousel', movement: 'shake',     glow: 'alternate', bpm: 175,
               rates: { color: 1, movement: 1, glow: 1 } },
    mystic:  { colors: [4],             pattern: 'none',     movement: 'equalizer', glow: 'sweep',     bpm: 85,
               rates: { color: 1, movement: 1, glow: 2 },
               easings: { glow: 'linear' } },
};

/** Mood keys in panel order; each is pressed with Shift. Mood None is the `<` key, not a Shift key. */
export const MOOD_QUICK = [
    { key: 'z', mood: 'calm',    label: 'Calm' },
    { key: 'x', mood: 'groove',  label: 'Groove' },
    { key: 'c', mood: 'build',   label: 'Build' },
    { key: 'v', mood: 'tension', label: 'Tension' },
    { key: 'b', mood: 'peak',    label: 'Peak' },
    { key: 'n', mood: 'mystic',  label: 'Mystic' },
];

/** key (lowercase letter) -> mood name. */
export const MOOD_KEY_TO_NAME = Object.fromEntries(
    MOOD_QUICK.map(({ key, mood }) => [key, mood])
);
