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
        phaseDuration: 800,
        speedRange: [10, 1500],
        axis: 'y',
        easing: 'easeInOutSine',
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
        phaseDuration: 700,
        speedRange: [10, 1500],
        axis: 'x',
        easing: 'easeInOutSine',
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
        phaseDuration: 350,
        speedRange: [10, 1500],
        axis: 'y',
        easing: 'easeInOutCubic',
        looping: true,
    },
    equalizer: {
        label: 'Equalizer',
        // Columns scale vertically like audio bars — asymmetric, organic
        phases: {
            MAIN: [0, 0, 0, 0, 0],
            A1:   [-0.12, 0.08, -0.05, 0.10, -0.08],
            A2:   [0.10, -0.10, 0.12, -0.06, 0.05],
            A3:   [-0.06, 0.12, -0.10, 0.05, 0.10],
            A4:   [0.08, -0.05, 0.06, -0.12, -0.06],
        },
        sequence: ['A1', 'A2', 'MAIN', 'A3', 'A4', 'MAIN', 'A2', 'A1'],
        phaseDuration: 300,
        speedRange: [50, 800],
        axis: 'scaleY',
        easing: 'easeInOutSine',
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
        phaseDuration: 80,
        speedRange: [10, 300],
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
