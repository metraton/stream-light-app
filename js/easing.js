// --- Easing Functions ---
export function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function linear(t) {
    return t;
}

/** Holds the phase's start value for the whole phase: a hard cut to the next one. */
export function step(t) {
    return t < 1 ? 0 : 1;
}

/** Exponential decay: about 95% of the change lands in the first third of the phase. */
export function expDecay(t) {
    return (1 - Math.exp(-9 * t)) / (1 - Math.exp(-9));
}

export const EASING_MAP = { easeInOutSine, easeInOutCubic, linear, step, expDecay };
