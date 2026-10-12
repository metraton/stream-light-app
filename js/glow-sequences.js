// --- Glow Sequence Definitions (per-column intensity keyframes) ---
// Each phase is an array of 5 intensity values [0-1] for columns 1-5. The
// engine interpolates from each sequence step to the next with the easing.
// phaseDuration is the default ms per step and speedRange bounds the panel
// slider; easing 'linear' is what the panel calls "Suave".

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
        phaseDuration: 300,
        speedRange: [30, 400],
        easing: 'linear',
        looping: true,
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
        phaseDuration: 300,
        speedRange: [30, 400],
        easing: 'linear',
        looping: true,
    },

    'breathe': {
        label: 'Breathe',
        phases: {
            LOW:  [0.15, 0.15, 0.15, 0.15, 0.15],
            HIGH: [1, 1, 1, 1, 1],
        },
        sequence: ['LOW', 'HIGH'],
        phaseDuration: 700,
        speedRange: [200, 1500],
        easing: 'easeInOutSine',
        looping: true,
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
        phaseDuration: 250,
        speedRange: [40, 600],
        easing: ['expDecay', 'step'],
        looping: true,
    },

    'strobe': {
        label: 'Strobe',
        phases: {
            OFF: [0, 0, 0, 0, 0],
            ON:  [1, 1, 1, 1, 1],
        },
        sequence: ['ON', 'OFF'],
        phaseDuration: 60,
        speedRange: [20, 200],
        easing: 'linear',
        looping: true,
    },

    'alternate': {
        label: 'Alternate',
        phases: {
            A: [0.9, 0, 0.9, 0, 0.9],
            B: [0, 0.9, 0, 0.9, 0],
        },
        sequence: ['A', 'B'],
        phaseDuration: 300,
        speedRange: [60, 600],
        easing: 'step',
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
