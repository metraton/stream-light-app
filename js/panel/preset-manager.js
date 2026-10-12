// --- Preset Manager (localStorage) ---
// Movement, glow and pattern speeds are saved as the app's tweaks (rate,
// easing, intensity per effect); the shared effect definitions are never written.
// Filters are saved as `colorFilter` (global + per-slot offsets). A preset from
// before that model carries `filters` (absolute per-slot values) and is
// converted on load by migrateLegacyFilters, so its columns look the same.
// Effects are saved as `effectStack` and Pantalla effects as `screenEffects`;
// a preset without either loads with none of those effects on.
import { CONFIG, DEFAULTS } from '../config.js';
import { restoreColorFilter, migrateLegacyFilters } from '../color-filter.js';
import { restoreEffectStack } from '../effect-stack.js';
import { restoreScreenStack, loadScreenStack, resetScreenStack } from '../screen-stack.js';
import { activeLayoutDefault } from '../layout-default.js';

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
        colorFilter: restoreColorFilter(CONFIG.colorFilter),
        effectStack: restoreEffectStack(CONFIG.effectStack),
        screenEffects: restoreScreenStack(CONFIG.screenEffects),
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
        if (data.colorFilter) {
            Object.assign(CONFIG.colorFilter, restoreColorFilter(data.colorFilter));
        } else if (data.filters) {
            Object.assign(CONFIG.colorFilter, migrateLegacyFilters(data.filters));
        }
        Object.assign(CONFIG.effectStack, restoreEffectStack(data.effectStack));
        loadScreenStack(CONFIG.screenEffects, data.screenEffects);
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

/** Restore colors, filters, effects, Pantalla effects, glow look and every speed tweak
 *  to their factory values, and the layout to the active layout default: the user's
 *  saved one ("Guardar como default" in Layout) when it exists, otherwise factory. The
 *  rotation is kept: the camera sets it, not the defaults. */
export function resetToDefaults(app, storage = localStorage) {
    const { rotationSteps } = CONFIG.columns;
    Object.assign(CONFIG.colors, DEFAULTS.colors);
    Object.assign(CONFIG.columns, DEFAULTS.columns, activeLayoutDefault(storage), { rotationSteps });
    Object.assign(CONFIG.colorFilter, restoreColorFilter(DEFAULTS.colorFilter));
    Object.assign(CONFIG.effectStack, restoreEffectStack(DEFAULTS.effectStack));
    resetScreenStack(CONFIG.screenEffects);
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
        app.columnManager.screenLayer.apply();
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
            app.columnManager.screenLayer.apply();
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
