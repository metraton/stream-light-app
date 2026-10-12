// --- Configuration (single source of truth, mutable for live updates) ---
import { createColorFilter } from './color-filter.js';

// Deep clone helper
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export const CONFIG = {
    columns: {
        count: 5,
        gap: 20,
        margin: 20,  // matches default gap; movement clamps keep Wave/Broken/Equalizer inside the edge at any margin
        cornerRadius: 15,
        // Single orientation control: 0=0°, 1=90°, 2=180°, 3=270° (clockwise).
        // Default 3 (270°) = old default rotate90(90°) + 180° flip → upright out of the box.
        rotationSteps: 3,
        zoom: 1.0,
        spread: 1.0,
    },
    colors: {
        YELLOW: 0xFFFF00,
        BLUE:   0x55AAFF,
        RED:    0xFF0000,
        GREEN:  0x00FF00,
        PURPLE: 0xFF00FF,
    },
    colorOrder: ['YELLOW', 'BLUE', 'RED', 'GREEN', 'PURPLE'],
    colorFilter: createColorFilter(),
    glow: {
        distance: 8,           // UI "Distance" — how far glow extends (px); range 2-25
        outerStrength: 2,      // UI "Strength" — outer glow intensity; range 0-10
        innerStrength: 0,      // inner glow intensity (0-10)
        quality: 0.50,         // UI "Quality" — render quality; range 0.05-0.5
        colorMode: 'column',   // UI "Color" — 'column' = match tint, 'white', 'custom'
        customColor: 0xffffff,
        intensity: 0,          // master alpha (0-1)
    },
    overlay: {
        mainText: 'STREAM LIGHT',
        subText: 'PVLMA',
        visible: false,
    },
};

// Store defaults for reset
export const DEFAULTS = {
    colors: deepClone(CONFIG.colors),
    columns: deepClone(CONFIG.columns),
    colorFilter: deepClone(CONFIG.colorFilter),
    glow: deepClone(CONFIG.glow),
};
