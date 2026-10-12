// --- Control Panel Orchestrator ---
import { CONFIG, DEFAULTS } from '../config.js';
import { createSlider } from './slider.js';
import { createSequencerControls } from './sequencer-controls.js';
import { createColorControls } from './color-controls.js';
import { createFilterControls } from './filter-controls.js';
import { createGlowControls } from './glow-controls.js';
import { createPresetControls } from './preset-manager.js';
import { createEffectControls } from './effect-controls.js';
import { createNowPlaying } from './layer-controls.js';

const SECTION_DEFS = [
    { key: 'sequencer', title: 'Sequencer', open: true },
    { key: 'colors',    title: 'Color Hex', open: false },
    { key: 'filters',   title: 'Color',     open: false },
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

    create() {
        this.element = document.createElement('div');
        this.element.className = 'control-panel hidden';

        // Header
        const header = document.createElement('div');
        header.className = 'panel-header';
        const title = document.createElement('h2');
        title.textContent = 'CONTROL';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.toggle());
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        this._buildSections();

        document.body.appendChild(this.element);
        // No side toggle tab: the closed state shows only the HUD over the
        // visuals. The panel opens/closes with the "P" key (see HUD hint).
    }

    _buildSections() {
        for (const def of SECTION_DEFS) {
            const { sectionEl, contentEl } = this.createSection(def.title, def.key, def.open);
            this.sections[def.key] = contentEl;

            switch (def.key) {
                case 'sequencer': {
                    const nowPlaying = createNowPlaying(contentEl, this.app);
                    const sequencer = createSequencerControls(contentEl, this.app);
                    // Movimiento and Glow follow the active effect however it
                    // was triggered: every key, button and mood ends in updateHUD.
                    const movement = () => this._movementRefresh?.();
                    const glow = () => this._glowRefresh?.();
                    this._sequencerRefresh = () => { nowPlaying(); sequencer(); movement(); glow(); };
                    break;
                }
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
        header.innerHTML = `<span class="section-chevron">${isOpen ? '\u25BC' : '\u25B6'}</span> ${title}`;

        const content = document.createElement('div');
        content.className = 'section-content';
        if (!isOpen) content.classList.add('collapsed');

        header.addEventListener('click', () => {
            const open = content.classList.toggle('collapsed');
            header.querySelector('.section-chevron').textContent = open ? '\u25B6' : '\u25BC';
            sessionStorage.setItem(`panel-${key}`, open ? 'closed' : 'open');
        });

        section.appendChild(header);
        section.appendChild(content);
        this.element.appendChild(section);
        return { sectionEl: section, contentEl: content };
    }

    createLayoutControls(sectionEl) {
        // Ranges keep the values that read as a layout change on a 1080p stage;
        // the slider is fine around the default (config.js) and coarse at the ends.
        const layouts = [
            { key: 'gap', label: 'Gap', min: 0, max: 40, decimals: 0 },
            { key: 'margin', label: 'Margin', min: 0, max: 60, decimals: 0 },
            { key: 'cornerRadius', label: 'Radius', min: 0, max: 30, decimals: 0 },
            { key: 'zoom', label: 'Zoom', min: 0.8, max: 1.5, decimals: 2 },
            { key: 'spread', label: 'Spread', min: 0.5, max: 1.5, decimals: 2 },
        ];

        for (const { key, label, min, max, decimals } of layouts) {
            createSlider(sectionEl, {
                label, min, max, decimals,
                defaultValue: DEFAULTS.columns[key], value: CONFIG.columns[key],
                onChange: v => {
                    CONFIG.columns[key] = v;
                    this.app.columnManager.rebuild();
                    this.app.reapplyColors();
                    if (this.app.overlay) this.app.overlay.moveToTop();
                },
            });
        }

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

    /** Called from app.updateHUD() to refresh sequencer visual state */
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
