// --- Glow Sequence Definitions (per-column intensity keyframes) ---
// Each phase is an array of 5 intensity values [0-1] for columns 1-5; the
// engine blends each sequence step into the next with the easing. `rate` is the
// default number of steps per beat (js/tempo.js), chosen at 120 BPM: a
// two-step flash at rate 2 fires once per beat. The definitions are frozen;
// panel tweaks live in the app.

export const GLOW_SEQUENCES = {
    'sweep-right': {
        label: 'Sweep →',
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
        rate: 2,
        easing: 'linear',
    },

    'sweep-left': {
        label: 'Sweep ←',
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
        rate: 2,
        easing: 'linear',
    },

    'breathe': {
        label: 'Breathe',
        phases: {
            LOW:  [0.15, 0.15, 0.15, 0.15, 0.15],
            HIGH: [1, 1, 1, 1, 1],
        },
        sequence: ['LOW', 'HIGH'],
        rate: 0.5,
        easing: 'easeInOutSine',
    },

    // A flash that decays fast, then darkness until the next flash: ON->OFF
    // decays exponentially, OFF holds and cuts straight back to ON.
    'pulse': {
        label: 'Pulse',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            ON:  [1, 1, 1, 1, 1],
        },
        sequence: ['ON', 'OFF'],
        rate: 2,
        easing: ['expDecay', 'step'],
    },

    'strobe': {
        label: 'Strobe',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            ON:  [1, 1, 1, 1, 1],
        },
        sequence: ['ON', 'OFF'],
        rate: 4,
        easing: 'linear',
    },

    'alternate': {
        label: 'Alternate',
        phases: {
            A: [0.9, 0, 0.9, 0, 0.9],
            B: [0, 0.9, 0, 0.9, 0],
        },
        sequence: ['A', 'B'],
        rate: 1,
        easing: 'step',
    },
};

for (const def of Object.values(GLOW_SEQUENCES)) Object.freeze(def);
Object.freeze(GLOW_SEQUENCES);
