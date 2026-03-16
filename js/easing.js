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

export const EASING_MAP = { easeInOutSine, easeInOutCubic, linear };
