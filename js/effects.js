// --- Effect Definitions (phase data + metadata) ---
// Offset values are reference at 1080p, auto-scaled to viewport by the engine.

export const EFFECTS = {
    wave: {
        label: 'Wave',
        phases: {
            MAIN:   [0, 0, 0, 0, 0],
            UP:     [0, -8, 0, -8, -1],
            PEAK:   [-15, -8, 0, -8, -15],
            DOWN:   [0, 7, 0, 7, 0],
            BOTTOM: [14, 8, 0, 7, 14],
        },
        sequence: ['UP', 'PEAK', 'UP', 'MAIN', 'DOWN', 'BOTTOM', 'DOWN', 'MAIN'],
        phaseDuration: 500,            // default speed (uniform 500ms)
        speedRange: [100, 1200],
        axis: 'y',
        easing: 'linear',              // default easing = "Suave" (= linear)
        looping: true,
    },
    expand: {
        label: 'Expand',
        phases: {
            MAIN: [0, 0, 0, 0, 0],
            E1:   [15, 7, 0, -7, -15],
            E2:   [-15, -7, 0, 7, 15],
        },
        sequence: ['E1', 'MAIN', 'E2', 'MAIN'],
        phaseDuration: 500,            // default speed (uniform 500ms)
        speedRange: [100, 1200],
        axis: 'x',
        easing: 'linear',              // default easing = "Suave" (= linear)
        looping: true,
    },
    broken: {
        label: 'Broken',
        // Diagonal staircase: columns break diagonally, center stays as pivot
        phases: {
            MAIN:        [0, 0, 0, 0, 0],
            STAIR_RIGHT: [-12, -6, 0, 6, 12],    // left up, right down (descending stairs)
            STAIR_LEFT:  [12, 6, 0, -6, -12],     // left down, right up (ascending stairs)
        },
        sequence: ['STAIR_RIGHT', 'MAIN', 'STAIR_LEFT', 'MAIN'],
        phaseDuration: 500,            // default speed (uniform 500ms)
        speedRange: [100, 1000],
        axis: 'y',
        easing: 'linear',              // default easing = "Suave" (= linear)
        looping: true,
    },
    equalizer: {
        label: 'Equalizer',
        // Smooth equalizer GRADIENT (not jumpy bars). Two fixes vs the old
        // ±0.065 alternating-sign version that felt brusque:
        //  (1) peak magnitude reduced to ±0.04 (gentler grow/shrink), and
        //  (2) adjacent columns differ by only ~0.02 and share sign, so the
        //      profile reads as a soft travelling hump rather than neighbours
        //      lurching opposite directions. A travelling gradient across the
        //      5 columns gives an organic, smooth equalizer feel.
        phases: {
            MAIN: [0, 0, 0, 0, 0],
            G1:   [0.04, 0.02, 0.00, -0.02, -0.04],
            G2:   [0.02, 0.04, 0.02, 0.00, -0.02],
            G3:   [0.00, 0.02, 0.04, 0.02, 0.00],
            G4:   [-0.02, 0.00, 0.02, 0.04, 0.02],
            G5:   [-0.04, -0.02, 0.00, 0.02, 0.04],
        },
        sequence: ['G1', 'G2', 'G3', 'G4', 'G5', 'G4', 'G3', 'G2'],
        phaseDuration: 500,            // default speed (uniform 500ms)
        speedRange: [50, 800],
        axis: 'scaleY',
        easing: 'linear',              // default easing = "Suave" (= linear)
        looping: true,
    },
    shake: {
        label: 'Shake',
        // Subtle high-speed tremor on both axes — tension/buzzing feel
        phases: {
            MAIN: { x: [0, 0, 0, 0, 0],    y: [0, 0, 0, 0, 0] },
            S1:   { x: [-2, 1, 0, -1, 2],   y: [1, -2, 1, 2, -1] },
            S2:   { x: [1, -1, 0, 1, -1],   y: [-2, 1, -1, -1, 2] },
            S3:   { x: [2, -2, 0, 2, -2],   y: [-1, 2, -2, 1, -2] },
            S4:   { x: [-1, 2, 0, -2, 1],   y: [2, -1, 2, -2, 1] },
        },
        sequence: ['S1', 'S2', 'S3', 'S4', 'S2', 'S1', 'S4', 'S3'],
        phaseDuration: 500,            // default speed (uniform 500ms; drag down for a fast tremor)
        speedRange: [10, 600],         // extended from 300 so the 500ms default is in range
        axis: 'xy',
        easing: 'linear',
        looping: true,
    },
};

// Store defaults for reset
export const EFFECT_DEFAULTS = {};
for (const [key, def] of Object.entries(EFFECTS)) {
    EFFECT_DEFAULTS[key] = {
        phaseDuration: def.phaseDuration,
        easing: def.easing,
    };
}
