// --- Text overlay model: settings, saved phrases, fade, beat pulse and neon flicker ---
// Pure data and math with no Pixi or DOM, so it runs under node --test.
// js/overlay.js draws from it and js/panel/text-controls.js edits it.

/** Fredoka is a rounded geometric display face; the overlay strokes it twice
 *  and never fills it, which gives the hollow double-outlined letters. */
export const TEXT_FONT_FAMILY = 'Fredoka';
export const TEXT_FONT_WEIGHT = 600;

export const MAX_PHRASE_LENGTH = 40;
export const PHRASES_KEY = 'streamlight-text-phrases';
export const SEED_PHRASES = ['FLASH LIGHT', 'CANDLE LIGHT'];

export const NEON_COLOR = 0xE4FFA0;
export const WHITE = 0xFFFFFF;
export const TEXT_COLOR_MODES = ['neon', 'column', 'white', 'custom'];
export const TEXT_POSITIONS = ['center', 'top', 'bottom'];
export const TEXT_BEAT_MODES = ['fixed', 'pulse', 'flicker'];
export const TEXT_SIZE = { min: 60, max: 320, default: 160 };

export const FADE_MS = 250;
// Extra glow strength on the beat, as a multiple of the base: 1 + PULSE_BOOST at the hit.
const PULSE_BOOST = 2;

/** Factory text settings; visibility is not a setting, so presets never switch the text on. */
export function defaultTextSettings() {
    return {
        phrase: SEED_PHRASES[0],
        colorMode: 'neon',
        customColor: WHITE,
        size: TEXT_SIZE.default,
        band: true,
        bandOpacity: 0.55,
        position: 'center',
        beat: 'fixed',
    };
}

/** Stored settings (a preset, possibly from before the text existed) as valid
 *  settings: each missing or invalid field takes its default. */
export function restoreTextSettings(saved) {
    const settings = defaultTextSettings();
    if (!saved || typeof saved !== 'object') return settings;
    const phrase = normalizePhrase(saved.phrase);
    if (phrase) settings.phrase = phrase;
    if (TEXT_COLOR_MODES.includes(saved.colorMode)) settings.colorMode = saved.colorMode;
    if (Number.isInteger(saved.customColor) && saved.customColor >= 0 && saved.customColor <= WHITE) {
        settings.customColor = saved.customColor;
    }
    if (Number.isFinite(saved.size) && saved.size >= TEXT_SIZE.min && saved.size <= TEXT_SIZE.max) {
        settings.size = saved.size;
    }
    if (typeof saved.band === 'boolean') settings.band = saved.band;
    if (Number.isFinite(saved.bandOpacity) && saved.bandOpacity >= 0 && saved.bandOpacity <= 1) {
        settings.bandOpacity = saved.bandOpacity;
    }
    if (TEXT_POSITIONS.includes(saved.position)) settings.position = saved.position;
    if (TEXT_BEAT_MODES.includes(saved.beat)) settings.beat = saved.beat;
    return settings;
}

// --- Saved phrases ---

/** `text` trimmed with inner whitespace collapsed, or null when it is not a
 *  string, is empty, or is longer than MAX_PHRASE_LENGTH. */
export function normalizePhrase(text) {
    if (typeof text !== 'string') return null;
    const phrase = text.trim().replace(/\s+/g, ' ');
    if (phrase.length === 0 || phrase.length > MAX_PHRASE_LENGTH) return null;
    return phrase;
}

const samePhrase = (a, b) => a.toLowerCase() === b.toLowerCase();

/** `phrases` with `text` appended; unchanged when `text` is invalid or already
 *  saved, compared without case. */
export function addPhrase(phrases, text) {
    const phrase = normalizePhrase(text);
    if (!phrase || phrases.some(p => samePhrase(p, phrase))) return phrases;
    return [...phrases, phrase];
}

/** `phrases` without `text`, compared without case. */
export function removePhrase(phrases, text) {
    return phrases.filter(p => !samePhrase(p, text));
}

/** The saved phrases; the seeds when nothing was ever saved. A stored empty
 *  list stays empty, so deleting every phrase holds across reloads. */
export function loadPhrases(storage = localStorage) {
    const raw = storage.getItem(PHRASES_KEY);
    if (raw === null) return [...SEED_PHRASES];
    let stored;
    try {
        stored = JSON.parse(raw);
    } catch {
        return [...SEED_PHRASES];
    }
    if (!Array.isArray(stored)) return [...SEED_PHRASES];
    return stored.reduce(addPhrase, []);
}

export function savePhrases(phrases, storage = localStorage) {
    storage.setItem(PHRASES_KEY, JSON.stringify(phrases));
}

// --- Look ---

/** The text color for `settings`: Columna is the first selected color (Empty
 *  skipped), white while none is selected. */
export function textColor(settings, selectedColors, colors, colorOrder) {
    switch (settings.colorMode) {
        case 'white': return WHITE;
        case 'custom': return settings.customColor;
        case 'column': {
            const first = selectedColors.find(idx => idx >= 0);
            return colors[colorOrder[first]] ?? WHITE;
        }
        default: return NEON_COLOR;
    }
}

const POSITION_FRACTION = { center: 0.5, top: 0.2, bottom: 0.8 };

/** Vertical center of the text on a stage `height` pixels tall. */
export function textCenterY(position, height) {
    return height * (POSITION_FRACTION[position] ?? POSITION_FRACTION.center);
}

// --- Fade ---

/** How long a fade from alpha `from` to `to` takes: FADE_MS for a full fade,
 *  proportionally less when it reverses one already under way. */
export function fadeDuration(from, to) {
    return FADE_MS * Math.abs(to - from);
}

/** Alpha `elapsedMs` into a linear fade from `from` to `to` lasting `durationMs`. */
export function fadeAlpha(from, to, elapsedMs, durationMs) {
    if (durationMs <= 0 || elapsedMs >= durationMs) return to;
    if (elapsedMs <= 0) return from;
    return from + (to - from) * (elapsedMs / durationMs);
}

// --- Beat behaviors ---

/** Glow multiplier for Pulso al golpe: 1 + PULSE_BOOST on the beat, decaying to 1 before the next. */
export function pulseGlow(beat) {
    const sinceHit = beat - Math.floor(beat);
    return 1 + PULSE_BOOST * (1 - sinceHit) ** 2;
}

// Parpadeo neón: time is cut into windows; a window holds a burst of 1-3 quick
// dips with probability FLICKER_CHANCE. The worst-case burst (start 900 ms, three
// 100 ms dips with 130 ms gaps) ends at 1460 ms, inside the 1500 ms window.
const FLICKER_WINDOW_MS = 1500;
const FLICKER_CHANCE = 0.3;
const FLICKER_MAX_START_MS = 900;

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The dips of window `windowIndex` for `seed`: [{ start, end, level }] in ms
 *  from the window start, level being the brightness (0-0.35) during the dip. */
export function flickerEvents(seed, windowIndex) {
    const random = seededRandom(seed ^ Math.imul(windowIndex, 0x9E3779B1));
    if (random() >= FLICKER_CHANCE) return [];
    const count = 1 + Math.floor(random() * 3);
    const events = [];
    let start = random() * FLICKER_MAX_START_MS;
    for (let i = 0; i < count; i++) {
        const length = 30 + random() * 70;
        events.push({ start, end: start + length, level: random() * 0.35 });
        start += length + 40 + random() * 90;
    }
    return events;
}

/** Brightness (0-1) of the flickering text at `timeMs`; the same seed and time always give the same value. */
export function flickerLevel(seed, timeMs) {
    const windowIndex = Math.floor(timeMs / FLICKER_WINDOW_MS);
    const offset = timeMs - windowIndex * FLICKER_WINDOW_MS;
    const dip = flickerEvents(seed, windowIndex).find(e => offset >= e.start && offset < e.end);
    return dip ? dip.level : 1;
}
