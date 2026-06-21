// --- Configuration (single source of truth, mutable for live updates) ---

// Deep clone helper
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export const CONFIG = {
    columns: {
        count: 5,
        gap: 20,
        margin: 40,  // headroom > peak Y movement (~15-20px) so Wave/Broken clear the edge
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
    filters: {
        brightness:  [0, 0, 0, 0, 0],       // -50 to +50
        contrast:    [1, 1, 1, 1, 1],        // 0 to 2
        saturation:  [1, 1, 1, 1, 1],        // 0 to 3
        hue:         [0, 0, 0, 0, 0],        // -180 to +180 degrees
        temperature: [0, 0, 0, 0, 0],        // -100 to +100 (cool to warm)
    },
    neutralFilter: {
        brightness:  0,
        contrast:    1,
        saturation:  1,
        hue:         0,
        temperature: 0,
    },
    glow: {
        distance: 8,           // how far glow extends (px)
        outerStrength: 3,      // outer glow intensity (0-10)
        innerStrength: 0,      // inner glow intensity (0-10)
        quality: 0.15,         // render quality (0.05-1, higher = smoother)
        colorMode: 'column',   // 'column' = match tint, 'white', 'custom'
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
    filters: deepClone(CONFIG.filters),
    neutralFilter: deepClone(CONFIG.neutralFilter),
    glow: deepClone(CONFIG.glow),
};
