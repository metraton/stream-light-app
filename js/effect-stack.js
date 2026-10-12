// --- Effect stack model: the effects of "Todos" plus a list per color slot ---
// A target is null for "Todos" or a color slot 0-4 (CONFIG.colorOrder). Each
// list holds { id, params } entries in the order they were turned on. Lists are
// kept by slot, like the color filter offsets, so effects follow the color
// wherever the pattern moves it.
import { EFFECTS } from './effects-registry.js';

const SLOT_COUNT = 5;

/** A stack with no effect on "Todos" or on any color. */
export function createEffectStack() {
    return { global: [], slots: Array.from({ length: SLOT_COUNT }, () => []) };
}

const listFor = (model, target) => (target === null ? model.global : model.slots[target]);
const findDef = (defs, id) => defs.find(def => def.id === id);

export function hasEffect(model, target, id) {
    return listFor(model, target).some(entry => entry.id === id);
}

/** Turn `id` on for `target` with its default params; an effect already on is left as it is. */
export function addEffect(model, target, id, defs = EFFECTS) {
    const def = findDef(defs, id);
    if (!def) throw new Error(`Unknown effect: ${id}`);
    if (hasEffect(model, target, id)) return;
    listFor(model, target).push({ id, params: { ...def.defaults } });
}

export function removeEffect(model, target, id) {
    const list = listFor(model, target);
    const index = list.findIndex(entry => entry.id === id);
    if (index !== -1) list.splice(index, 1);
}

export function toggleEffect(model, target, id, defs = EFFECTS) {
    if (hasEffect(model, target, id)) removeEffect(model, target, id);
    else addEffect(model, target, id, defs);
}

export function setEffectParam(model, target, id, key, value) {
    const entry = listFor(model, target).find(e => e.id === id);
    if (entry) entry.params[key] = value;
}

export function clearEffects(model, target) {
    listFor(model, target).length = 0;
}

/** Remove every effect from "Todos" and every color, in place so holders of the lists see it. */
export function resetEffectStack(model) {
    clearEffects(model, null);
    for (let slot = 0; slot < SLOT_COUNT; slot++) clearEffects(model, slot);
}

/**
 * The effects a column showing color `slot` runs, in order: the "Todos" list,
 * then the color's own effects. A color entry for an effect that "Todos" also
 * has keeps the "Todos" position but uses the color's params. A slot outside
 * 0-4 (uncolored) gets the "Todos" list alone. Entries are copies.
 */
export function resolveEffects(model, slot) {
    const resolved = model.global.map(({ id, params }) => ({ id, params: { ...params } }));
    for (const { id, params } of model.slots[slot] ?? []) {
        const shared = resolved.find(entry => entry.id === id);
        if (shared) shared.params = { ...params };
        else resolved.push({ id, params: { ...params } });
    }
    return resolved;
}

/** Identifies the filter chain of a resolved list: equal keys need no new `filters` array. */
export function chainKey(effects) {
    return effects.map(({ id }) => id).join('+');
}

function restoreParams(def, data) {
    const params = { ...def.defaults };
    for (const param of def.params) {
        const value = data?.[param.key];
        if (param.options) {
            if (param.options.some(option => option.value === value)) params[param.key] = value;
        } else if (Number.isFinite(value)) {
            params[param.key] = Math.min(param.max, Math.max(param.min, value));
        }
    }
    return params;
}

function restoreList(list, defs) {
    if (!Array.isArray(list)) return [];
    const restored = [];
    for (const entry of list) {
        const def = findDef(defs, entry?.id);
        if (!def || restored.some(e => e.id === def.id)) continue;
        restored.push({ id: def.id, params: restoreParams(def, entry.params) });
    }
    return restored;
}

/**
 * A stack rebuilt from persisted data: unknown or repeated effects are
 * dropped, params outside their schema fall back to the default or are
 * clamped, and missing data (presets from before effects) gives an empty stack.
 */
export function restoreEffectStack(data, defs = EFFECTS) {
    const model = createEffectStack();
    model.global = restoreList(data?.global, defs);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
        model.slots[slot] = restoreList(data?.slots?.[slot], defs);
    }
    return model;
}
