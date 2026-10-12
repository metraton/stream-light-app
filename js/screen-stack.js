// --- Screen effect model: the Pantalla effects that are on, with their params ---
// A list of { id, params } kept in SCREEN_EFFECTS order, so the passes run in
// one fixed order however they were turned on. Every function changes the list
// in place, because the screen layer holds CONFIG.screenEffects itself.
import { SCREEN_EFFECTS } from './screen-effects.js';
import { restoreEffectStack } from './effect-stack.js';

const registryIndex = id => SCREEN_EFFECTS.findIndex(def => def.id === id);
const byRegistryOrder = (a, b) => registryIndex(a.id) - registryIndex(b.id);

export function hasScreenEffect(list, id) {
    return list.some(entry => entry.id === id);
}

/** Turn `id` off when it is on, else on with its default params at its registry position. */
export function toggleScreenEffect(list, id) {
    const index = list.findIndex(entry => entry.id === id);
    if (index !== -1) {
        list.splice(index, 1);
        return;
    }
    const def = SCREEN_EFFECTS.find(d => d.id === id);
    if (!def) throw new Error(`Unknown screen effect: ${id}`);
    list.push({ id, params: { ...def.defaults } });
    list.sort(byRegistryOrder);
}

export function setScreenParam(list, id, key, value) {
    const entry = list.find(e => e.id === id);
    if (entry) entry.params[key] = value;
}

export function resetScreenStack(list) {
    list.length = 0;
}

/**
 * A list rebuilt from persisted data by the per-color stack's rules: unknown or
 * repeated effects are dropped and params are checked against their controls.
 * Data that is not a list, as in presets from before Pantalla, gives none.
 */
export function restoreScreenStack(data) {
    return restoreEffectStack({ global: data }, SCREEN_EFFECTS).global.sort(byRegistryOrder);
}

/** Replace the contents of `list` with the list restored from `data`. */
export function loadScreenStack(list, data) {
    list.splice(0, list.length, ...restoreScreenStack(data));
}
