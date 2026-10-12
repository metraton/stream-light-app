// --- Effect Definitions (phase data + metadata) ---
// Offset values are reference at 1080p, auto-scaled to viewport by the engine.
// phaseDuration is the default ms per sequence step and speedRange bounds the
// panel slider; easing 'linear' is what the panel calls "Suave".

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
        phaseDuration: 550,
        speedRange: [100, 1200],
        axis: 'y',
        easing: 'linear',
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
        speedRange: [100, 1200],
        axis: 'x',
        easing: 'linear',
        looping: true,
    },
    broken: {
        label: 'Broken',
        // Neighbouring columns jump in opposite vertical directions, a zigzag
        // that Expand's symmetric horizontal spread never produces.
        phases: {
            MAIN: [0, 0, 0, 0, 0],
            ZIG:  [-20, 20, -20, 20, -20],
            ZAG:  [20, -20, 20, -20, 20],
        },
        sequence: ['ZIG', 'MAIN', 'ZAG', 'MAIN'],
        phaseDuration: 500,
        speedRange: [100, 1000],
        axis: 'y',
        easing: 'linear',
        looping: true,
    },
    equalizer: {
        label: 'Equalizer',
        // Every column follows the same +/-10% height sine, 72 degrees behind
        // its left neighbour, so the bars rise and fall out of phase.
        phases: {
            E0: [0.00, 0.10, 0.06, -0.06, -0.10],
            E1: [0.07, 0.09, -0.02, -0.10, -0.05],
            E2: [0.10, 0.03, -0.08, -0.08, 0.03],
            E3: [0.07, -0.05, -0.10, -0.02, 0.09],
            E4: [0.00, -0.10, -0.06, 0.06, 0.10],
            E5: [-0.07, -0.09, 0.02, 0.10, 0.05],
            E6: [-0.10, -0.03, 0.08, 0.08, -0.03],
            E7: [-0.07, 0.05, 0.10, 0.02, -0.09],
        },
        sequence: ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'],
        phaseDuration: 180,
        speedRange: [50, 800],
        axis: 'scaleY',
        easing: 'linear',
        looping: true,
    },
    shake: {
        label: 'Shake',
        // A real jitter: +/-4 px on both axes, a new position every 50 ms.
        phases: {
            MAIN: { x: [0, 0, 0, 0, 0],     y: [0, 0, 0, 0, 0] },
            S1:   { x: [-4, 2, 0, -2, 4],   y: [2, -4, 2, 4, -2] },
            S2:   { x: [2, -2, 0, 2, -2],   y: [-4, 2, -2, -2, 4] },
            S3:   { x: [4, -4, 0, 4, -4],   y: [-2, 4, -4, 2, -4] },
            S4:   { x: [-2, 4, 0, -4, 2],   y: [4, -2, 4, -4, 2] },
        },
        sequence: ['S1', 'S2', 'S3', 'S4', 'S2', 'S1', 'S4', 'S3'],
        phaseDuration: 50,
        speedRange: [10, 600],
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
