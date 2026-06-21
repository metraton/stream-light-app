// --- Control Panel Orchestrator ---
import { CONFIG } from '../config.js';
import { createSequencerControls } from './sequencer-controls.js';
import { createColorControls } from './color-controls.js';
import { createFilterControls } from './filter-controls.js';
import { createGlowControls } from './glow-controls.js';
import { createPresetControls } from './preset-manager.js';
import { createEffectControls } from './effect-controls.js';

const SECTION_DEFS = [
    { key: 'sequencer', title: 'Sequencer', open: true },
    { key: 'colors',    title: 'Color Hex', open: false },
    { key: 'filters',   title: 'Filters',   open: false },
    { key: 'layout',    title: 'Layout',    open: false },
    { key: 'effects',   title: 'Effects',   open: false },
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
                case 'sequencer':
                    this._sequencerRefresh = createSequencerControls(contentEl, this.app);
                    break;
                case 'colors':
                    createColorControls(contentEl, this.app);
                    break;
                case 'layout':
                    this.createLayoutControls(contentEl);
                    break;
                case 'effects':
                    createEffectControls(contentEl, this.app);
                    break;
                case 'filters':
                    createFilterControls(contentEl, this.app);
                    break;
                case 'glow':
                    createGlowControls(contentEl, this.app);
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
        const layouts = [
            { key: 'gap', label: 'Gap', min: 0, max: 50, step: 1 },
            { key: 'margin', label: 'Margin', min: 0, max: 50, step: 1 },
            { key: 'cornerRadius', label: 'Radius', min: 0, max: 40, step: 1 },
            { key: 'zoom', label: 'Zoom', min: 0.5, max: 2.0, step: 0.05 },
            { key: 'spread', label: 'Spread', min: 0, max: 2.0, step: 0.05 },
        ];

        this.layoutSliders = {};

        for (const { key, label, min, max, step } of layouts) {
            const row = document.createElement('div');
            row.className = 'layout-row';

            const lbl = document.createElement('label');
            lbl.textContent = label;

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = CONFIG.columns[key];

            const val = document.createElement('span');
            val.className = 'range-value';
            val.textContent = CONFIG.columns[key];

            slider.addEventListener('input', () => {
                const v = parseFloat(slider.value);
                CONFIG.columns[key] = v;
                val.textContent = Number.isInteger(v) ? v : v.toFixed(2);
                this.app.columnManager.rebuild();
                if (this.app.overlay) this.app.overlay.moveToTop();
            });

            this.layoutSliders[key] = { slider, val };

            row.appendChild(lbl);
            row.appendChild(slider);
            row.appendChild(val);
            sectionEl.appendChild(row);
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
        rotBtn.addEventListener('click', () => {
            this.app.cycleRotation();
            rotBtn.textContent = angleText();
        });

        rotRow.appendChild(rotLabel);
        rotRow.appendChild(rotBtn);
        sectionEl.appendChild(rotRow);
    }

    toggle() {
        this.visible = !this.visible;
        this.element.classList.toggle('hidden', !this.visible);
    }

    /** Called from app.updateHUD() to refresh sequencer visual state */
    refreshSequencerUI() {
        if (this._sequencerRefresh) this._sequencerRefresh();
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
