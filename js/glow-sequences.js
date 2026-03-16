// --- Glow Sequence Definitions (per-column intensity keyframes) ---
// Each phase is an array of 5 intensity values [0-1] for columns 1-5.
// The engine interpolates between phases using the sequence order + easing.

export const GLOW_SEQUENCES = {
    'sweep-right': {
        label: 'Sweep \u2192',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            C1:  [1, 0, 0, 0, 0],
            C2:  [0.3, 1, 0, 0, 0],
            C3:  [0, 0.3, 1, 0, 0],
            C4:  [0, 0, 0.3, 1, 0],
            C5:  [0, 0, 0, 0.3, 1],
            TAIL:[0, 0, 0, 0, 0.3],
        },
        sequence: ['C1', 'C2', 'C3', 'C4', 'C5', 'TAIL', 'OFF'],
        phaseDuration: 120,
        speedRange: [30, 400],
        easing: 'linear',
        looping: true,
    },

    'sweep-left': {
        label: 'Sweep \u2190',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            C5:  [0, 0, 0, 0, 1],
            C4:  [0, 0, 0, 1, 0.3],
            C3:  [0, 0, 1, 0.3, 0],
            C2:  [0, 1, 0.3, 0, 0],
            C1:  [1, 0.3, 0, 0, 0],
            TAIL:[0.3, 0, 0, 0, 0],
        },
        sequence: ['C5', 'C4', 'C3', 'C2', 'C1', 'TAIL', 'OFF'],
        phaseDuration: 120,
        speedRange: [30, 400],
        easing: 'linear',
        looping: true,
    },

    'bounce': {
        label: 'Bounce',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            L1:  [1, 0, 0, 0, 0],
            L2:  [0.3, 1, 0, 0, 0],
            M:   [0, 0.3, 1, 0.3, 0],
            R2:  [0, 0, 0, 1, 0.3],
            R1:  [0, 0, 0, 0, 1],
            R2B: [0, 0, 0, 1, 0.3],
            MB:  [0, 0.3, 1, 0.3, 0],
            L2B: [0.3, 1, 0, 0, 0],
        },
        sequence: ['L1', 'L2', 'M', 'R2', 'R1', 'R2B', 'MB', 'L2B'],
        phaseDuration: 130,
        speedRange: [30, 400],
        easing: 'easeInOutSine',
        looping: true,
    },

    'breathe': {
        label: 'Breathe',
        phases: {
            OFF:  [0, 0, 0, 0, 0],
            LOW:  [0.15, 0.15, 0.15, 0.15, 0.15],
            MID:  [0.5, 0.5, 0.5, 0.5, 0.5],
            HIGH: [1, 1, 1, 1, 1],
        },
        sequence: ['LOW', 'MID', 'HIGH', 'MID', 'LOW', 'OFF'],
        phaseDuration: 600,
        speedRange: [200, 1500],
        easing: 'easeInOutSine',
        looping: true,
    },

    'pulse': {
        label: 'Pulse',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            ON:  [0.9, 0.9, 0.9, 0.9, 0.9],
            DIM: [0.2, 0.2, 0.2, 0.2, 0.2],
        },
        sequence: ['ON', 'DIM', 'ON', 'DIM', 'ON', 'OFF'],
        phaseDuration: 120,
        speedRange: [40, 400],
        easing: 'linear',
        looping: true,
    },

    'strobe': {
        label: 'Strobe',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            ON:  [1, 1, 1, 1, 1],
        },
        sequence: ['ON', 'OFF'],
        phaseDuration: 50,
        speedRange: [20, 200],
        easing: 'linear',
        looping: true,
    },

    'cascade': {
        label: 'Cascade',
        phases: {
            OFF:  [0, 0, 0, 0, 0],
            S1:   [0.8, 0, 0, 0, 0],
            S2:   [0.8, 0.8, 0, 0, 0],
            S3:   [0.8, 0.8, 0.8, 0, 0],
            S4:   [0.8, 0.8, 0.8, 0.8, 0],
            FULL: [1, 1, 1, 1, 1],
            HOLD: [1, 1, 1, 1, 1],
        },
        sequence: ['S1', 'S2', 'S3', 'S4', 'FULL', 'HOLD', 'OFF'],
        phaseDuration: 200,
        speedRange: [80, 600],
        easing: 'easeInOutSine',
        looping: true,
    },

    'alternate': {
        label: 'Alternate',
        phases: {
            A: [0.9, 0, 0.9, 0, 0.9],
            B: [0, 0.9, 0, 0.9, 0],
        },
        sequence: ['A', 'B'],
        phaseDuration: 250,
        speedRange: [60, 600],
        easing: 'easeInOutSine',
        looping: true,
    },
};

// Store defaults for reset
export const GLOW_SEQ_DEFAULTS = {};
for (const [key, def] of Object.entries(GLOW_SEQUENCES)) {
    GLOW_SEQ_DEFAULTS[key] = {
        phaseDuration: def.phaseDuration,
        easing: def.easing,
    };
}
