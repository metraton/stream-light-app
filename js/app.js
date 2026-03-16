// --- StreamLightApp (slim orchestrator) ---
import { CONFIG } from './config.js';
import { EFFECTS } from './effects.js';
import { EffectEngine } from './effect-engine.js';
import { GlowEngine } from './glow-engine.js';
import { GLOW_SEQUENCES } from './glow-sequences.js';
import { ColorSequencer } from './color-sequencer.js';
import { ColumnManager } from './columns.js';
import { Overlay } from './overlay.js';
import { HUD } from './hud.js';
import { setupShortcuts } from './shortcuts.js';
import { setupWebcam, createTestPattern } from './camera.js';
import { ControlPanel } from './panel/panel.js';

export class StreamLightApp {
    constructor() {
        this.pixiApp = null;
        this.videoElement = null;
        this.videoTexture = null;
        this.columnManager = null;
        this.effectEngine = new EffectEngine();
        this.glowEngine = new GlowEngine();
        this.sequencer = new ColorSequencer();
        this.overlay = null;
        this.hud = null;
        this.panel = null;
        this.currentGlowMode = 'none';
    }

    async init(deviceId) {
        await this.createPixiApp();
        const { videoElement, videoTexture } = await setupWebcam(deviceId);
        this.videoElement = videoElement;
        this.videoTexture = videoTexture;
        this.setup();
    }

    async initDemo() {
        await this.createPixiApp();
        const { videoElement, videoTexture } = createTestPattern();
        this.videoElement = videoElement;
        this.videoTexture = videoTexture;
        this.setup();
    }

    setup() {
        this.columnManager = new ColumnManager(this.pixiApp);
        this.columnManager.setVideo(this.videoElement, this.videoTexture);
        this.columnManager.create();
        this.columnManager.setRainbow();

        this.overlay = new Overlay(this.pixiApp);
        this.overlay.create();

        this.hud = new HUD();
        this.updateHUD();

        this.panel = new ControlPanel(this);
        this.panel.create();

        // Wire sequencer to apply color frames to columns
        this.sequencer.onFrameChange((frame, stepIndex) => {
            this._applyColorFrame(frame);
        });

        setupShortcuts(this);

        this.pixiApp.ticker.add((ticker) => this.update(ticker));
    }

    async createPixiApp() {
        this.pixiApp = new PIXI.Application();
        await this.pixiApp.init({
            resizeTo: window,
            backgroundColor: 0x000000,
            antialias: true,
            resolution: 1,
        });
        document.getElementById('app').appendChild(this.pixiApp.canvas);

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.columnManager && this.columnManager.count > 0) {
                    this.columnManager.rebuild();
                    if (this.overlay) this.overlay.moveToTop();
                }
            }, 100);
        });
    }

    // --- Color Frame Application ---
    _applyColorFrame(frame) {
        if (!this.columnManager) return;

        // If all columns are empty (-1) and no colors selected, go neutral
        const allEmpty = frame.every(c => c === -1);
        if (allEmpty && this.sequencer.selectedColors.length === 0) {
            for (const col of this.columnManager.columns) {
                col.sprite.tint = 0xFFFFFF;
                col.container.alpha = 1;
            }
            for (let i = 0; i < this.columnManager.columnColors.length; i++) {
                this.columnManager.columnColors[i] = 'NEUTRAL';
            }
            this.columnManager.updateGlowColors();
            this.columnManager.applyFilters();
            this.updateHUD();
            return;
        }

        for (let i = 0; i < frame.length && i < this.columnManager.columns.length; i++) {
            const colorIdx = frame[i];
            const col = this.columnManager.columns[i];
            if (colorIdx === -1) {
                // Neutral: no tint, full visibility, participates in effects
                col.sprite.tint = 0xFFFFFF;
                col.container.alpha = 1;
                this.columnManager.columnColors[i] = 'NEUTRAL';
            } else {
                const colorName = ColorSequencer.colorName(colorIdx);
                const hex = CONFIG.colors[colorName];
                if (hex !== undefined) {
                    col.sprite.tint = hex;
                    col.container.alpha = 1;
                    this.columnManager.columnColors[i] = colorName;
                }
            }
        }
        this.columnManager.updateGlowColors();
        this.columnManager.applyFilters(); // re-apply: neutral uses different filter set
        this.updateHUD();
    }

    // --- Public API (called by shortcuts) ---

    /** Play a movement effect (independent from color) */
    playMovement(effectName) {
        const def = EFFECTS[effectName];
        if (!def) return;
        this.effectEngine.play(effectName, def);
        this.updateHUD();
    }

    stopEffect() {
        this.effectEngine.stop();
        this.columnManager.resetOffsets();
        this.updateHUD();
    }

    /** Set glow mode from sequencer keyboard */
    setGlowMode(mode) {
        this.currentGlowMode = mode;
        if (mode === 'none') {
            this.stopGlowEffect();
        } else if (mode === 'static') {
            // Static: constant glow, no animation
            this.glowEngine.stop();
            this.columnManager.setAllGlow(CONFIG.glow.outerStrength > 0 ? 1 : 0.8);
        } else {
            // Map sequencer glow names to glow-sequences.js names
            const glowMap = {
                breathe: 'breathe',
                pulse: 'pulse',
                strobe: 'strobe',
                'sweep-right': 'sweep-right',
            };
            const seqName = glowMap[mode] || mode;
            if (seqName && this._hasGlowSequence(seqName)) {
                this.playGlowEffect(seqName);
            }
        }
    }

    _hasGlowSequence(name) {
        return !!GLOW_SEQUENCES[name];
    }

    playGlowEffect(name) {
        const def = GLOW_SEQUENCES[name];
        if (!def) return;
        this.glowEngine.play(name, def);
    }

    stopGlowEffect() {
        this.glowEngine.stop();
        this.columnManager.setAllGlow(0);
        this.currentGlowMode = 'none';
    }

    /** Apply a mood preset (sets colors + pattern + movement + glow + bpm) */
    applyMood(mood) {
        this.sequencer.selectedColors = [...mood.colors];
        this.sequencer.setBPM(mood.bpm);
        this.sequencer.setPattern(mood.pattern);

        // Movement
        if (mood.movement && mood.movement !== 'none') {
            this.playMovement(mood.movement);
        } else {
            this.stopEffect();
        }

        // Glow
        if (mood.glow && mood.glow !== 'none') {
            this.setGlowMode(mood.glow);
        } else {
            this.stopGlowEffect();
        }
    }

    setAllColors(colorName) {
        this.columnManager.setAllColors(colorName);
        this.updateHUD();
    }

    setRainbow() {
        this.columnManager.setRainbow();
        this.updateHUD();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            document.body.classList.add('hide-cursor');
        } else {
            document.exitFullscreen().catch(() => {});
            document.body.classList.remove('hide-cursor');
        }
    }

    toggleHUD() {
        if (this.hud) this.hud.toggle();
    }

    toggleOverlay() {
        if (this.overlay) this.overlay.toggle();
    }

    toggleRotation() {
        CONFIG.columns.rotate90 = !CONFIG.columns.rotate90;
        this.columnManager.rebuild();
        if (this.overlay) this.overlay.moveToTop();
    }

    togglePanel() {
        if (this.panel) this.panel.toggle();
    }

    updateHUD() {
        if (!this.hud) return;
        const seq = this.sequencer.state;
        const colorNames = seq.colors.map(c => ColorSequencer.colorName(c)).join('+') || 'none';
        const mode = seq.pattern ? `${seq.pattern}` : 'direct';
        const effectName = this.effectEngine.activeName;
        const glowName = this.currentGlowMode;

        this.hud.update(
            `${colorNames} [${mode}]`,
            effectName,
            glowName !== 'none' ? glowName : null,
            seq.bpm
        );

        // Refresh panel sequencer visuals (mini-stage, tags, dots)
        if (this.panel) this.panel.refreshSequencerUI();
    }

    // --- Main Loop ---
    update(ticker) {
        if (this.videoTexture && this.videoTexture.source) {
            this.videoTexture.source.update();
        }

        // Update color sequencer timing
        this.sequencer.update(performance.now());

        const scaleFactor = this.pixiApp.screen.height / 1080;
        const offsets = this.effectEngine.compute(CONFIG.columns.count, scaleFactor);
        if (offsets) {
            this.columnManager.applyOffsets(offsets);
        }

        const glowData = this.glowEngine.compute(CONFIG.columns.count);
        if (glowData) {
            this.columnManager.applyGlowIntensities(glowData.intensity);
        }

        if (this.hud) this.hud.updateFPS(ticker.FPS);
    }
}
