// --- Effect registry: the per-color effects a column can run after its color adjust ---
// Each effect is { id, label, defaults, params, create(params, context), update(filter, params, context) }.
// `params` describes the panel controls: a slider ({ key, label, min, max,
// decimals }) or a button choice ({ key, label, options: [{ value, label }] }).
// `context.color` is the hex of the color the column shows, null when uncolored.
// create() and update() reach the PIXI global only when called, so the
// definitions load in Node for the stack tests.

export const EFFECTS = [];

/** The definition registered under `id`, undefined when there is none. */
export function effectById(id) {
    return EFFECTS.find(effect => effect.id === id);
}
