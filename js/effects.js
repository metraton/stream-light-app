// --- Effect Definitions (phase data + metadata) ---
// Offset values are reference at 1080p, auto-scaled to viewport by the engine.
// `rate` is the default number of sequence steps per beat (js/tempo.js), chosen
// at 120 BPM; easing 'linear' is what the panel calls "Suave". The definitions
// are frozen; panel tweaks live in the app.

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
        rate: 1,
        axis: 'y',
        easing: 'linear',
    },
    expand: {
        label: 'Expand',
        phases: {
            MAIN: [0, 0, 0, 0, 0],
            E1:   [15, 7, 0, -7, -15],
            E2:   [-15, -7, 0, 7, 15],
        },
        sequence: ['E1', 'MAIN', 'E2', 'MAIN'],
        rate: 1,
        axis: 'x',
        easing: 'linear',
    },
    broken: {
        label: 'Broken',
        // A staircase, not a zigzag: offsets step linearly across the row
        // around a still center, so as one end rises the other sinks. The row
        // tilts, flattens, then tilts the opposite way.
        phases: {
            MAIN:   [0, 0, 0, 0, 0],
            TILT_A: [-12, -6, 0, 6, 12],
            TILT_B: [12, 6, 0, -6, -12],
        },
        sequence: ['TILT_A', 'MAIN', 'TILT_B', 'MAIN'],
        rate: 1,
        axis: 'y',
        easing: 'linear',
    },
    equalizer: {
        label: 'Equalizer',
        // The fluid version the user approved: a +/-0.04 height hump travels
        // across the row and back. Neighbours differ by 0.02 and mostly share
        // a sign, so the bars swell together instead of lurching apart.
        phases: {
            G1: [0.04, 0.02, 0.00, -0.02, -0.04],
            G2: [0.02, 0.04, 0.02, 0.00, -0.02],
            G3: [0.00, 0.02, 0.04, 0.02, 0.00],
            G4: [-0.02, 0.00, 0.02, 0.04, 0.02],
            G5: [-0.04, -0.02, 0.00, 0.02, 0.04],
        },
        sequence: ['G1', 'G2', 'G3', 'G4', 'G5', 'G4', 'G3', 'G2'],
        rate: 1,
        axis: 'scaleY',
        easing: 'linear',
    },
    shake: {
        label: 'Shake',
        // A held tremor for the Tension mood: +/-2 px on both axes, gliding to
        // a new position twice a beat. More amplitude or rate reads as frantic.
        phases: {
            S1: { x: [-2, 1, 0, -1, 2], y: [1, -2, 1, 2, -1] },
            S2: { x: [1, -1, 0, 1, -1], y: [-2, 1, -1, -1, 2] },
            S3: { x: [2, -2, 0, 2, -2], y: [-1, 2, -2, 1, -2] },
            S4: { x: [-1, 2, 0, -2, 1], y: [2, -1, 2, -2, 1] },
        },
        sequence: ['S1', 'S2', 'S3', 'S4', 'S2', 'S1', 'S4', 'S3'],
        rate: 2,
        axis: 'xy',
        easing: 'linear',
    },
    zoomPulse: {
        label: 'Golpe de zoom',
        // Each step opens at the full punch, a 4% scale about the column's
        // center, and the step's easing carries it to rest. With one phase only
        // the first curve of Destello is ever used: expDecay drops ~95% in the
        // first third.
        phases: { PUNCH: 0.04 },
        sequence: ['PUNCH'],
        rate: 1,
        axis: 'scale',
        easing: ['expDecay', 'step'],
    },
};

for (const def of Object.values(EFFECTS)) Object.freeze(def);
Object.freeze(EFFECTS);
