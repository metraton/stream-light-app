// --- Color sets: five colors that replace the slot colors together ---
// A set is { name, colors } with five '#rrggbb' in CONFIG.colorOrder slot order.
// Applying one only rewrites CONFIG.colors, so selections, patterns and filter
// offsets, which are all keyed by slot, keep working unchanged.
// Share code: SHARE_PREFIX + base64url(JSON [SHARE_VERSION, name, [5 hex]]).
import { CONFIG, DEFAULTS } from './config.js';

export const SLOT_COUNT = 5;
export const NAME_MAX_LENGTH = 32;
export const SHARE_PREFIX = 'SLA1.';
export const SHARE_VERSION = 1;

const HEX_RE = /^#[0-9a-f]{6}$/i;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const USER_SETS_KEY = 'streamlight-color-sets';

/** '#rrggbb' of a 0xRRGGBB integer. */
export function hexFromInt(val) {
    return '#' + val.toString(16).padStart(6, '0');
}

export const BUILTIN_SETS = Object.freeze([
    { name: 'Original', colors: CONFIG.colorOrder.map(name => hexFromInt(DEFAULTS.colors[name])) },
    { name: 'Neón', colors: ['#ffee00', '#00e5ff', '#ff1744', '#39ff14', '#d500f9'] },
    { name: 'Atardecer', colors: ['#ffc93c', '#ff8c42', '#ff3c38', '#c9184a', '#7b2cbf'] },
    { name: 'Océano', colors: ['#48cae4', '#0096c7', '#3a86ff', '#00f5d4', '#4361ee'] },
    { name: 'Púrpura místico', colors: ['#ff77e9', '#c77dff', '#ff4fa3', '#e0aaff', '#9d4edd'] },
    { name: 'Cálido', colors: ['#ffd60a', '#ff9e00', '#ff5400', '#ff006e', '#ffb4a2'] },
    { name: 'Frío', colors: ['#caf0f8', '#4cc9f0', '#4361ee', '#2ec4b6', '#7209b7'] },
    { name: 'Pastel', colors: ['#fdffb6', '#a0c4ff', '#ffadad', '#caffbf', '#bdb2ff'] },
    { name: 'Rayos X', colors: ['#e0ffff', '#00ffff', '#4d9fff', '#ffffff', '#7df9ff'] },
].map(set => Object.freeze({ name: set.name, colors: Object.freeze(set.colors) })));

/**
 * A set with a trimmed name and lowercase hex.
 * @throws {Error} with a message the panel shows as is.
 */
export function validateSet(name, colors) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0 || trimmed.length > NAME_MAX_LENGTH) {
        throw new Error(`El nombre debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres.`);
    }
    if (!Array.isArray(colors) || colors.length !== SLOT_COUNT) {
        throw new Error(`Un set necesita exactamente ${SLOT_COUNT} colores.`);
    }
    const invalid = colors.find(c => typeof c !== 'string' || !HEX_RE.test(c));
    if (invalid !== undefined) {
        throw new Error(`Color inválido: ${JSON.stringify(invalid).slice(0, 20)} (se espera #rrggbb).`);
    }
    return { name: trimmed, colors: colors.map(c => c.toLowerCase()) };
}

/** The share code of a set; the name is UTF-8 so accents survive. */
export function encodeShareCode({ name, colors }) {
    const set = validateSet(name, colors);
    const bytes = new TextEncoder().encode(JSON.stringify([SHARE_VERSION, set.name, set.colors]));
    const base64 = btoa(String.fromCharCode(...bytes));
    return SHARE_PREFIX + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The set a share code carries.
 * @throws {Error} naming what is wrong: prefix, encoding, version, colors or name.
 */
export function decodeShareCode(code) {
    const text = String(code ?? '').trim();
    if (!text.startsWith(SHARE_PREFIX)) {
        throw new Error(`El código debe empezar con ${SHARE_PREFIX}`);
    }
    let payload;
    try {
        const body = text.slice(SHARE_PREFIX.length);
        if (!BASE64URL_RE.test(body)) throw new Error('not base64url');
        const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        throw new Error('El código está dañado: no es base64url con JSON.');
    }
    if (!Array.isArray(payload)) {
        throw new Error('El código no tiene la forma [versión, nombre, colores].');
    }
    if (payload[0] !== SHARE_VERSION) {
        throw new Error(`Versión de código no soportada: ${JSON.stringify(payload[0])}.`);
    }
    if (payload.length !== 3) {
        throw new Error('El código no tiene la forma [versión, nombre, colores].');
    }
    return validateSet(payload[1], payload[2]);
}

/** Saved user sets; a stored entry that no longer validates is skipped. */
export function loadUserSets() {
    let stored;
    try {
        stored = JSON.parse(localStorage.getItem(USER_SETS_KEY) ?? '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(stored)) return [];
    return stored.flatMap(entry => {
        try {
            return [validateSet(entry?.name, entry?.colors)];
        } catch {
            return [];
        }
    });
}

/**
 * Save a user set, replacing a user set with the same name.
 * @throws {Error} when the set is invalid or takes a built-in name.
 */
export function saveUserSet(name, colors) {
    const set = validateSet(name, colors);
    if (BUILTIN_SETS.some(b => b.name.toLowerCase() === set.name.toLowerCase())) {
        throw new Error(`"${set.name}" es un set incluido; usa otro nombre.`);
    }
    const sets = loadUserSets().filter(s => s.name !== set.name);
    localStorage.setItem(USER_SETS_KEY, JSON.stringify([...sets, set]));
    return set;
}

export function deleteUserSet(name) {
    const sets = loadUserSets().filter(s => s.name !== name);
    localStorage.setItem(USER_SETS_KEY, JSON.stringify(sets));
}
