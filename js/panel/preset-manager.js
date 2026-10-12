// --- Preset Manager (localStorage) ---
// Movement, glow and pattern speeds are saved as the app's tweaks (rate,
// easing, intensity per effect); the shared effect definitions are never written.
import { CONFIG, DEFAULTS } from '../config.js';

const STORAGE_PREFIX = 'streamlight-preset-';

export function savePreset(name, app) {
    const data = {
        colors: { ...CONFIG.colors },
        columns: {
            gap: CONFIG.columns.gap,
            margin: CONFIG.columns.margin,
            cornerRadius: CONFIG.columns.cornerRadius,
            zoom: CONFIG.columns.zoom,
            spread: CONFIG.columns.spread,
        },
        filters: {
            brightness:  [...CONFIG.filters.brightness],
            contrast:    [...CONFIG.filters.contrast],
            saturation:  [...CONFIG.filters.saturation],
            hue:         [...CONFIG.filters.hue],
            temperature: [...CONFIG.filters.temperature],
        },
        glow: { ...CONFIG.glow },
        tweaks: app.exportTweaks(),
    };

    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data));
}

/** Load a preset; presets saved before tweaks existed keep the default speeds. */
export function loadPreset(name, app) {
    const raw = localStorage.getItem(STORAGE_PREFIX + name);
    if (!raw) return false;

    try {
        const data = JSON.parse(raw);

        if (data.colors) {
            Object.assign(CONFIG.colors, data.colors);
        }
        if (data.columns) {
            Object.assign(CONFIG.columns, data.columns);
        }
        if (data.filters) {
            for (const key of Object.keys(CONFIG.filters)) {
                if (Array.isArray(data.filters[key])) {
                    CONFIG.filters[key] = [...data.filters[key]];
                }
            }
        }
        if (data.glow) {
            Object.assign(CONFIG.glow, data.glow);
        }
        app.importTweaks(data.tweaks);
        return true;
    } catch {
        return false;
    }
}

export function listPresets() {
    const presets = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(STORAGE_PREFIX)) {
            presets.push(key.slice(STORAGE_PREFIX.length));
        }
    }
    return presets.sort();
}

export function deletePreset(name) {
    localStorage.removeItem(STORAGE_PREFIX + name);
}

/** Restore colors, layout, filters, glow look and every speed tweak to their
 *  defaults. The rotation is kept: the camera sets it, not the defaults. */
export function resetToDefaults(app) {
    const { rotationSteps } = CONFIG.columns;
    Object.assign(CONFIG.colors, DEFAULTS.colors);
    Object.assign(CONFIG.columns, DEFAULTS.columns, { rotationSteps });
    for (const key of Object.keys(DEFAULTS.filters)) {
        CONFIG.filters[key] = [...DEFAULTS.filters[key]];
    }
    Object.assign(CONFIG.glow, DEFAULTS.glow);
    app.resetTweaks();
}

export function createPresetControls(sectionEl, app) {
    // Reset row
    const resetRow = document.createElement('div');
    resetRow.className = 'preset-row';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.style.flex = '1';
    resetBtn.addEventListener('click', () => {
        resetToDefaults(app);
        app.resetToBase();
        app.columnManager.rebuild();
        app.reapplyColors();
        if (app.overlay) app.overlay.moveToTop();
        if (app.panel) app.panel.refresh();
    });
    resetRow.appendChild(resetBtn);
    sectionEl.appendChild(resetRow);

    // Save row
    const saveRow = document.createElement('div');
    saveRow.className = 'preset-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Preset name...';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) return;
        savePreset(name, app);
        nameInput.value = '';
        refreshPresetList();
    });

    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    sectionEl.appendChild(saveRow);

    // Load row
    const loadRow = document.createElement('div');
    loadRow.className = 'preset-row';

    const presetSelect = document.createElement('select');
    presetSelect.id = 'preset-select';

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
        const name = presetSelect.value;
        if (!name) return;
        if (loadPreset(name, app)) {
            app.columnManager.rebuild();
            app.reapplyColors();
            if (app.overlay) app.overlay.moveToTop();
            // Refresh panel controls to reflect new values
            if (app.panel) app.panel.refresh();
        }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Del';
    deleteBtn.addEventListener('click', () => {
        const name = presetSelect.value;
        if (!name) return;
        deletePreset(name);
        refreshPresetList();
    });

    loadRow.appendChild(presetSelect);
    loadRow.appendChild(loadBtn);
    loadRow.appendChild(deleteBtn);
    sectionEl.appendChild(loadRow);

    function refreshPresetList() {
        const presets = listPresets();
        presetSelect.innerHTML = presets.length === 0
            ? '<option value="">No presets</option>'
            : presets.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    refreshPresetList();
}
