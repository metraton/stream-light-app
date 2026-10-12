// --- StreamLightApp (slim orchestrator) ---
import { CONFIG } from './config.js';
import { EFFECTS } from './effects.js';
import { EffectEngine } from './effect-engine.js';
import { GlowEngine } from './glow-engine.js';
import { GLOW_SEQUENCES } from './glow-sequences.js';
import { GLOW_MODE_SEQUENCE, canonicalGlowMode } from './glow-map.js';
import { BASE_STATE } from './mood-map.js';
import { ColorSequencer } from './color-sequencer.js';
import { ColumnManager } from './columns.js';
import { Overlay } from './overlay.js';
import { HUD } from './hud.js';
import { setupShortcuts } from './shortcuts.js';
import { connectLiveBridge } from './live-bridge.js';
import { setupWebcam, createTestPattern, defaultRotationSteps } from './camera.js';
import { ControlPanel } from './panel/panel.js';

// The stage always renders at 1080p and CSS scales the canvas to the window,
// so the layout and its pixel-sized margins, gaps and glow never depend on the window.
const RENDER_WIDTH = 1920;
const RENDER_HEIGHT = 1080;

// Frame-rate caps the panel cycles through; 0 is Pixi's "no cap" (the monitor's refresh rate).
const MAX_FPS_OPTIONS = [30, 60, 0];
const DEFAULT_MAX_FPS = 60;

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
        this.maxFPS = DEFAULT_MAX_FPS;
        // Active layer names, the single source of truth for the panel's highlights.
        this.currentGlowMode = BASE_STATE.glow;
        this.currentMovement = BASE_STATE.movement;
        this.currentMood = BASE_STATE.mood;
    }

    async init(deviceId) {
        await this.createPixiApp();
        const { videoElement, videoTexture } = await setupWebcam(deviceId);
        this.videoElement = videoElement;
        this.videoTexture = videoTexture;
        this._applyCameraRotation();
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

        // Paint the sequencer's current frame: neutral at startup, since the
        // base state selects no colors.
        this.reapplyColors();

        setupShortcuts(this);
        connectLiveBridge(this);

        this.pixiApp.ticker.add((ticker) => this.update(ticker));
    }

    async createPixiApp() {
        this.pixiApp = new PIXI.Application();
        await this.pixiApp.init({
            width: RENDER_WIDTH,
            height: RENDER_HEIGHT,
            backgroundColor: 0x000000,
            antialias: true,
            resolution: 1,
        });
        this.setMaxFPS(this.maxFPS);
        document.getElementById('app').appendChild(this.pixiApp.canvas);
    }

    /** Cap rendering at `fps` frames per second; 0 renders at the monitor's refresh rate. */
    setMaxFPS(fps) {
        this.maxFPS = fps;
        this.pixiApp.ticker.maxFPS = fps;
    }

    /** Step the frame-rate cap 30 -> 60 -> Monitor -> 30. Returns the new cap. */
    cycleMaxFPS() {
        const next = MAX_FPS_OPTIONS[(MAX_FPS_OPTIONS.indexOf(this.maxFPS) + 1) % MAX_FPS_OPTIONS.length];
        this.setMaxFPS(next);
        return next;
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
        this.currentMovement = effectName;
        this.currentMood = null;           // manual change drops the mood highlight
        this.updateHUD();
    }

    stopEffect() {
        this.effectEngine.stop();
        this.columnManager.resetOffsets();
        this.currentMovement = 'none';
        this.currentMood = null;
        this.updateHUD();
    }

    /** Set the glow layer to a quick mode (glow-map.js); removed mode names are translated. */
    setGlowMode(requestedMode) {
        const mode = canonicalGlowMode(requestedMode);
        this.currentGlowMode = mode;
        this.currentMood = null; // manual change drops the mood highlight
        if (mode === 'none') {
            this.stopGlowEffect();
        } else if (mode === 'static') {
            // Static: constant glow, no animation
            this.glowEngine.stop();
            this.columnManager.setAllGlow(CONFIG.glow.outerStrength > 0 ? 1 : 0.8);
        } else {
            this.playGlowEffect(GLOW_MODE_SEQUENCE[mode] ?? mode);
        }
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
        this.currentMood = null;
    }

    /** Apply a mood (mood-map.js): colors, pattern, movement, glow and BPM.
     *  The color rotation does not start until Space ("nothing auto-plays");
     *  movement and glow are continuous layers and start at once.
     *  @param {object} mood - mood definition
     *  @param {string|null} moodKey - mood name, for the active-state highlight */
    applyMood(mood, moodKey = null) {
        this.sequencer.staging = false;
        this.sequencer.selectedColors = [...mood.colors];
        this.sequencer.setBPM(mood.bpm);
        this.sequencer.setPattern(mood.pattern);

        if (mood.movement && mood.movement !== 'none') {
            this.playMovement(mood.movement);
        } else {
            this.stopEffect();
        }

        if (mood.glow && mood.glow !== 'none') {
            this.setGlowMode(mood.glow);
        } else {
            this.stopGlowEffect();
        }

        // Set after the layer calls, which clear currentMood, so the mood button highlights.
        this.currentMood = moodKey;
        this.updateHUD();
    }

    /** Mood None: clear only the active-mood highlight. The live layers stay as
     *  they are; each has its own None button. */
    clearMood() {
        this.currentMood = null;
        this.updateHUD();
    }

    /** CUE (Backspace / panel Cue): stage a new combo while the live rotation
     *  keeps playing. On commit the live state becomes the cued colors, the
     *  pattern pressed while staging (the base pattern if none), and the base
     *  movement, glow and mood; BPM is kept. */
    cue() {
        this.sequencer.startStaging(BASE_STATE.pattern, true);
        this.updateHUD();
    }

    /** Commit a cue (Space / panel Play while staging): pending -> live, play
     *  from 0, and reset movement/glow/mood when the cue asked for it. */
    commitCue() {
        const res = this.sequencer.commitStaged();
        if (res && res.fullReset) this._resetLayersToBase();
        this.updateHUD();
    }

    /** Return every performance layer to BASE_STATE, BPM and stopped playback
     *  included (Escape, Reset to Defaults). Layout, filters, rotation and the
     *  FPS cap are not performance layers and stay as they are. */
    resetToBase() {
        this.sequencer.resetToBase();
        this._resetLayersToBase();
        this.updateHUD();
    }

    /** Movement, glow and mood to BASE_STATE; the sequencer resets itself. */
    _resetLayersToBase() {
        if (BASE_STATE.movement === 'none') {
            this.stopEffect();
        } else {
            this.playMovement(BASE_STATE.movement);
        }
        this.setGlowMode(BASE_STATE.glow);
        this.currentMood = BASE_STATE.mood;
    }

    /** Re-render columns from the ColorSequencer's current frame, the single
     *  source of truth for column colors: at startup, after a rebuild (resize /
     *  layout change), and after a color-value or preset change. */
    reapplyColors() {
        if (this.sequencer) this.sequencer._applyCurrentFrame();
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

    /** Cycle orientation 0°→90°→180°→270°→0°. Returns the new step (0-3). */
    cycleRotation() {
        CONFIG.columns.rotationSteps = (((CONFIG.columns.rotationSteps || 0) + 1) % 4);
        this.columnManager.rebuild();
        this.reapplyColors();
        if (this.overlay) this.overlay.moveToTop();
        return CONFIG.columns.rotationSteps;
    }

    togglePanel() {
        if (this.panel) this.panel.toggle();
    }

    /** deviceId of the live webcam feed; undefined in demo mode. */
    get activeCameraId() {
        return this._activeCameraTrack()?.getSettings().deviceId;
    }

    _activeCameraTrack() {
        return this.videoElement?.srcObject?.getVideoTracks()[0];
    }

    /** Reset the orientation to the live camera's default, overriding any manual rotation. */
    _applyCameraRotation() {
        CONFIG.columns.rotationSteps = defaultRotationSteps(this._activeCameraTrack()?.label);
    }

    /** Replace the live feed with camera `deviceId`, stopping the old stream first and reopening it if the new camera fails. */
    async switchCamera(deviceId) {
        const previousId = this.activeCameraId;
        if (this._switchingCamera || !previousId) return;
        this._switchingCamera = true;
        const oldTexture = this.videoTexture;
        this.videoElement.srcObject.getTracks().forEach(t => t.stop());
        try {
            let feed;
            try {
                feed = await setupWebcam(deviceId);
            } catch (e) {
                console.error('Camera switch failed, reopening the previous camera:', e);
                feed = await setupWebcam(previousId);
            }
            this.videoElement = feed.videoElement;
            this.videoTexture = feed.videoTexture;
            this.columnManager.setVideo(this.videoElement, this.videoTexture);
            this._applyCameraRotation();
            this.panel?.refreshRotationLabel?.();
            this.columnManager.rebuild();
            this.reapplyColors();
            if (this.overlay) this.overlay.moveToTop();
            oldTexture.destroy(true);
            this.updateHUD();
        } catch (e) {
            console.error('No camera could be reopened:', e);
        } finally {
            this._switchingCamera = false;
        }
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
            seq.bpm,
            this._activeCameraTrack()?.label
        );

        // Refresh panel sequencer visuals (mini-stage, tags, dots)
        if (this.panel) this.panel.refreshSequencerUI();
    }

    // --- Main Loop ---
    // The video texture is not uploaded here: Pixi 8's VideoSource auto-updates
    // itself from requestVideoFrameCallback, once per new camera frame.
    update(ticker) {
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
