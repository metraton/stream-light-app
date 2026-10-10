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
        // Persistent active-state, single source of truth for the panel's
        // highlight sync. Mirrors currentGlowMode so movement/glow are symmetric.
        this.currentGlowMode = 'none';
        this.currentMovement = 'none';
        this.currentMood = null;
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

        // Paint the initial colors from the sequencer's current frame (neutral
        // at startup, since no colors are selected yet). Replaces the legacy
        // setRainbow() startup call — colors are sequencer-driven now.
        this.reapplyColors();

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
                    // Re-apply the ColorSequencer's current frame synchronously,
                    // in the SAME tick as rebuild(), so the live combo (e.g.
                    // calm = solid blue) is restored with NO rainbow flash.
                    // rebuild() leaves sprites white; this overwrites them before
                    // the next render, so no intermediate colors are ever shown.
                    this.reapplyColors();
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
        this.currentMovement = effectName; // persistent active-state (lowercase key)
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

    /** Set glow mode from sequencer keyboard */
    setGlowMode(mode) {
        this.currentGlowMode = mode;
        this.currentMood = null; // manual change drops the mood highlight
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
                sweep: 'sweep-right',        // 'sweep' alias -> the sweep-right sequence
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
        this.currentMood = null;
    }

    /** Apply a mood preset (sets colors + pattern + movement + glow + bpm).
     *  @param {object} mood - mood definition
     *  @param {string|null} moodKey - mood name, for the active-state highlight */
    applyMood(mood, moodKey = null) {
        // Moods set up the combo LIVE but do NOT auto-cycle ("nothing auto-plays"
        // model): selectedColors/pattern are set and the static frame is painted,
        // but the color rotation only starts when the user presses SPACE. There is
        // intentionally NO sequencer.play() call here. (Movement/Glow are separate
        // continuous layers and still start, matching their own quick-key behavior.)
        this.sequencer.staging = false;
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

        // Set mood AFTER the layer calls (they clear currentMood) so the mood
        // button highlights; the full refresh below re-syncs every button bank.
        this.currentMood = moodKey;
        this.updateHUD();
    }

    /** Mood "None": clear only the active-mood highlight (no preset selected).
     *  Consistent with the cue model — does NOT revert the live colors/pattern/
     *  movement/glow, which the user can change via their own None buttons. */
    clearMood() {
        this.currentMood = null;
        this.updateHUD();
    }

    /** CUE (Backspace): identical to the total cue. */
    cueReset() {
        this.totalReset();
    }

    /** TOTAL CUE (Shift+Backspace / panel button): stage a new combo while the
     *  live rotation keeps playing. On commit the live state becomes the cued
     *  colors, the pattern pressed while staging (Solid if none), and Movement,
     *  Glow and Mood None; BPM is kept. */
    totalReset() {
        this.sequencer.startStaging('solid', true);
        this.updateHUD();
    }

    /** Commit a cue (Space / panel Play while staging): pending -> live, play
     *  from 0, and reset movement/glow/mood when the cue asked for it. */
    commitCue() {
        const res = this.sequencer.commitStaged();
        if (res && res.fullReset) {
            this.stopEffect();          // Movement -> None
            this.setGlowMode('none');   // Glow -> None
            this.currentMood = null;    // Mood -> None
        }
        this.updateHUD();               // re-sync highlights (Solid gold, A None, Z None, no mood)
    }

    /** EMPTY RESET (Escape): brutal clean slate. Colors -> empty (visible
     *  neutral), Movement=None, Glow=None, Mood=None, playback STOPPED, staging
     *  cancelled. Pattern resets to the 'solid' baseline (not null) so the
     *  resulting "listening" state shows a real active pattern (R highlighted,
     *  HUD consistent) — matching the total-cue baseline and avoiding the old
     *  pattern=null limbo. After Escape the user builds a fresh combo and
     *  presses SPACE to play (nothing auto-plays). */
    emptyReset() {
        this.sequencer.clearColors();            // empty: columns neutral, stops playback, exits staging
        this.sequencer.setPattern('solid');      // Pattern -> Solid baseline (clean listening state)
        this.stopEffect();                       // Movement -> None
        this.setGlowMode('none');                // Glow -> None
        this.currentMood = null;                 // Mood -> None
        this.updateHUD();                        // re-sync highlights
    }

    /** Re-render columns from the ColorSequencer's current frame. Single source
     *  of truth for column colors — used at startup, after a rebuild (resize /
     *  layout change), and after a color-value or preset change. Replaces the
     *  legacy setRainbow()/setAllColors()/refreshColors() path that snapped
     *  back to a stale "color mode" (the cause of the resize rainbow flash). */
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
