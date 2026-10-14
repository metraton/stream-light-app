// --- Control Panel Orchestrator ---
import { CONFIG, DEFAULTS } from '../config.js';
import {
    LAYOUT_DEFS, activeLayoutDefault, factoryLayout, loadUserLayout, saveUserLayout, clearUserLayout,
} from '../layout-default.js';
import { createSlider } from './slider.js';
import { createSequencerControls } from './sequencer-controls.js';
import { createColorControls } from './color-controls.js';
import { createFilterControls } from './filter-controls.js';
import { createGlowControls } from './glow-controls.js';
import { createPresetControls } from './preset-manager.js';
import { createEffectControls } from './effect-controls.js';
import { createNowPlaying } from './layer-controls.js';
import { createScreenControls } from './screen-controls.js';
import { createTextControls } from './text-controls.js';

const SECTION_DEFS = [
    { key: 'sequencer', title: 'Sequencer', open: true },
    { key: 'text',      title: 'Texto',     open: false },
    { key: 'colors',    title: 'Color Hex', open: false },
    { key: 'filters',   title: 'Color',     open: false },
    { key: 'screen',    title: 'Pantalla',  open: false },
    { key: 'layout',    title: 'Layout',    open: false },
    { key: 'effects',   title: 'Movimiento', open: false },
    { key: 'glow',      title: 'Glow Params', open: false },
    { key: 'presets',   title: 'Presets',    open: false },
];

export class ControlPanel {
    constructor(app) {
        this.app = app;
        this.element = null;
        this.tab = null;
        this.visible = false;
        this.sections = {};
        this._sequencerRefresh = null; // callback for live updates
    }

    /** Builds the panel once at startup, starting the columns from the active layout default. */
    create() {
        // Applied here and not in refresh(), which runs after a preset load
        // and must keep the preset's layout.
        this._applyLayout(activeLayoutDefault());

        this.element = document.createElement('div');
        this.element.className = 'control-panel hidden';

        // Header
        const header = document.createElement('div');
        header.className = 'panel-header';
        const title = document.createElement('h2');
        title.textContent = 'CONTROL';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.toggle());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        this._buildSections();

        document.body.appendChild(this.element);
        // No side toggle tab: the closed state shows only the visuals. The
        // panel opens/closes with the "P" key.
    }

    _buildSections() {
        for (const def of SECTION_DEFS) {
            const { sectionEl, contentEl } = this.createSection(def.title, def.key, def.open);
            this.sections[def.key] = contentEl;

            switch (def.key) {
                case 'sequencer': {
                    const nowPlaying = createNowPlaying(contentEl, this.app);
                    const sequencer = createSequencerControls(contentEl, this.app);
                    // Movimiento, Glow and Texto follow the app however it was
                    // changed: every key, button and mood ends in refreshPanel.
                    const movement = () => this._movementRefresh?.();
                    const glow = () => this._glowRefresh?.();
                    const text = () => this._textRefresh?.();
                    this._sequencerRefresh = () => { nowPlaying(); sequencer(); movement(); glow(); text(); };
                    break;
                }
                case 'text':
                    this._textRefresh = createTextControls(contentEl, this.app);
                    break;
                case 'colors':
                    this._colorHexRefresh = createColorControls(contentEl, this.app, () => this.refreshColorSwatches());
                    break;
                case 'layout':
                    this.createLayoutControls(contentEl);
                    break;
                case 'effects':
                    this._movementRefresh = createEffectControls(contentEl, this.app);
                    break;
                case 'filters':
                    this._filterRefresh = createFilterControls(contentEl, this.app);
                    break;
                case 'screen':
                    createScreenControls(contentEl, this.app);
                    break;
                case 'glow':
                    this._glowRefresh = createGlowControls(contentEl, this.app);
                    break;
                case 'presets':
                    createPresetControls(contentEl, this.app);
                    break;
            }
        }
    }

    createSection(title, key, startOpen) {
        const saved = sessionStorage.getItem(`panel-${key}`);
        const isOpen = saved !== null ? saved === 'open' : startOpen;

        const section = document.createElement('div');
        section.className = 'panel-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<span class="section-chevron">${isOpen ? '▼' : '▶'}</span> ${title}`;

        const content = document.createElement('div');
        content.className = 'section-content';
        if (!isOpen) content.classList.add('collapsed');

        header.addEventListener('click', () => {
            const open = content.classList.toggle('collapsed');
            header.querySelector('.section-chevron').textContent = open ? '▶' : '▼';
            sessionStorage.setItem(`panel-${key}`, open ? 'closed' : 'open');
        });

        section.appendChild(header);
        section.appendChild(content);
        this.element.appendChild(section);
        return { sectionEl: section, contentEl: content };
    }

    /** Sets layout fields of CONFIG.columns and redraws the columns; rotation and FPS cap are untouched. */
    _applyLayout(values) {
        Object.assign(CONFIG.columns, values);
        this.app.columnManager.rebuild();
        this.app.reapplyColors();
        if (this.app.overlay) this.app.overlay.moveToTop();
    }

    createLayoutControls(sectionEl) {
        // Ranges keep the values that read as a layout change on a 1080p stage;
        // the slider is fine around the default (config.js) and coarse at the ends.
        const sliders = LAYOUT_DEFS.map(({ key, label, min, max, decimals }) => ({
            key,
            slider: createSlider(sectionEl, {
                label, min, max, decimals,
                defaultValue: DEFAULTS.columns[key], value: CONFIG.columns[key],
                onChange: v => this._applyLayout({ [key]: v }),
            }),
        }));
        const showLayout = () => {
            for (const { key, slider } of sliders) slider.show(CONFIG.columns[key]);
        };

        // Reset goes to the active default (yours if saved, else factory);
        // Fábrica forgets yours, so it also holds across reloads.
        const defaultRow = document.createElement('div');
        defaultRow.className = 'preset-row';
        const addButton = (text, title, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.title = title;
            btn.style.flex = '1';
            btn.addEventListener('click', onClick);
            defaultRow.appendChild(btn);
        };

        const statusRow = document.createElement('div');
        statusRow.className = 'layout-row';
        const status = document.createElement('label');
        statusRow.appendChild(status);
        const showStatus = () => {
            status.textContent = loadUserLayout() ? 'Default: tuyo' : 'Default: fábrica';
        };

        addButton('Reset', 'Vuelve al default activo: el tuyo si guardaste uno, si no el de fábrica', () => {
            this._applyLayout(activeLayoutDefault());
            showLayout();
        });
        addButton('Guardar como default', 'Guarda Gap, Margin, Radius, Zoom y Spread actuales como tu default', () => {
            saveUserLayout(CONFIG.columns);
            showStatus();
        });
        addButton('Fábrica', 'Valores de fábrica y borra tu default guardado', () => {
            if (!confirm('¿Volver al Layout de fábrica y borrar tu default guardado?')) return;
            clearUserLayout();
            this._applyLayout(factoryLayout());
            showLayout();
            showStatus();
        });

        showStatus();
        sectionEl.appendChild(defaultRow);
        sectionEl.appendChild(statusRow);

        // Rotate: single button cycling 0°/90°/180°/270°, displaying current angle.
        const rotRow = document.createElement('div');
        rotRow.className = 'layout-row';

        const rotLabel = document.createElement('label');
        rotLabel.textContent = 'Rotate';

        const rotBtn = document.createElement('button');
        rotBtn.className = 'rotate-btn';
        const angleText = () => `⟳ ${(((CONFIG.columns.rotationSteps % 4) + 4) % 4) * 90}°`;
        rotBtn.textContent = angleText();
        this.refreshRotationLabel = () => { rotBtn.textContent = angleText(); };
        rotBtn.addEventListener('click', () => {
            this.app.cycleRotation();
            rotBtn.textContent = angleText();
        });

        rotRow.appendChild(rotLabel);
        rotRow.appendChild(rotBtn);
        sectionEl.appendChild(rotRow);

        // FPS cap: single button cycling 30 / 60 / Monitor (uncapped), displaying the current cap.
        const fpsRow = document.createElement('div');
        fpsRow.className = 'layout-row';

        const fpsLabel = document.createElement('label');
        fpsLabel.textContent = 'FPS cap';

        const fpsBtn = document.createElement('button');
        fpsBtn.className = 'rotate-btn';
        const fpsText = () => (this.app.maxFPS === 0 ? 'Monitor' : `${this.app.maxFPS}`);
        fpsBtn.textContent = fpsText();
        fpsBtn.addEventListener('click', () => {
            this.app.cycleMaxFPS();
            fpsBtn.textContent = fpsText();
        });

        fpsRow.appendChild(fpsLabel);
        fpsRow.appendChild(fpsBtn);
        sectionEl.appendChild(fpsRow);
    }

    toggle() {
        this.visible = !this.visible;
        this.element.classList.toggle('hidden', !this.visible);
    }

    /** Called from app.refreshPanel() to refresh sequencer visual state */
    refreshSequencerUI() {
        if (this._sequencerRefresh) this._sequencerRefresh();
    }

    /** Redraws every swatch (sequencer, mini-stage, Color chips, Color Hex) from CONFIG.colors. */
    refreshColorSwatches() {
        this._sequencerRefresh?.();
        this._filterRefresh?.();
        this._colorHexRefresh?.();
    }

    refresh() {
        // Remove all sections (keep header)
        while (this.element.children.length > 1) {
            this.element.removeChild(this.element.lastChild);
        }
        this.sections = {};
        this._buildSections();
    }
}
