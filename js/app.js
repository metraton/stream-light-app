// --- StreamLightApp (slim orchestrator) ---
import { CONFIG } from './config.js';
import { EFFECTS } from './effects.js';
import { EffectEngine } from './effect-engine.js';
import { GlowEngine } from './glow-engine.js';
import { GLOW_SEQUENCES } from './glow-sequences.js';
import { GLOW_MODE_SEQUENCE, canonicalGlowMode } from './glow-map.js';
import { BASE_STATE } from './mood-map.js';
import { EASING_MAP } from './easing.js';
import { RATES } from './tempo.js';
import { ColorSequencer, PATTERN_RATES } from './color-sequencer.js';
import { ColumnManager } from './columns.js';
import { Overlay, loadOverlayFont } from './overlay.js';
import { setupShortcuts } from './shortcuts.js';
import { connectLiveBridge } from './live-bridge.js';
import { setupWebcam, createTestPattern, defaultRotationSteps } from './camera.js';
import { ControlPanel } from './panel/panel.js';
import { INTENSITY_MIN, INTENSITY_MAX } from './panel/effect-controls.js';

// The stage always renders at 1080p and CSS scales the canvas to the window,
// so the layout and its pixel-sized margins, gaps and glow never depend on the window.
const RENDER_WIDTH = 1920;
const RENDER_HEIGHT = 1080;

// Frame-rate caps the panel cycles through; 0 is Pixi's "no cap" (the monitor's refresh rate).
const MAX_FPS_OPTIONS = [30, 60, 0];
const DEFAULT_MAX_FPS = 60;

/** A stored easing is one curve name or an array of them, each known to EASING_MAP. */
function isEasing(value) {
    const curves = Array.isArray(value) ? value : [value];
    return curves.length > 0 && curves.every(c => typeof c === 'string' && Object.hasOwn(EASING_MAP, c));
}

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
        this.panel = null;
        this.maxFPS = DEFAULT_MAX_FPS;
        // Active layer names, the single source of truth for the panel's highlights.
        this.currentGlowMode = BASE_STATE.glow;
        this.currentMovement = BASE_STATE.movement;
        this.currentMood = BASE_STATE.mood;
        // Panel tweaks per effect ({ rate, easing, intensity }) over the frozen
        // definitions; the color layer keeps its own in sequencer.patternRates.
        this.tweaks = { movement: {}, glow: {} };
        this.stagedChanges = [];
    }

    async init(deviceId) {
        const [, { videoElement, videoTexture }] = await Promise.all([this.createPixiApp(), setupWebcam(deviceId)]);
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
        // The overlay first draws in the fallback face; startup never waits on the font,
        // since a stalled font request never settles.
        loadOverlayFont().then(faces => {
            if (faces.length > 0) this.overlay.refresh();
        });

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

        this.pixiApp.ticker.add(() => this.update());
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
            this.refreshPanel();
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
        this.refreshPanel();
    }

    // --- Tempo and per-effect tweaks ---

    _beatNow() {
        return this.sequencer.beatAt(performance.now());
    }

    _engineFor(layer) {
        return layer === 'movement' ? this.effectEngine : this.glowEngine;
    }

    /** What `name` plays with: the panel's tweak over the definition's defaults. */
    _settingsFor(layer, name, def) {
        const tweak = this.tweaks[layer][name] ?? {};
        return {
            rate: tweak.rate ?? def.rate,
            easing: tweak.easing ?? def.easing,
            intensity: tweak.intensity ?? 1,
        };
    }

    _setTweak(layer, name, field, value) {
        (this.tweaks[layer][name] ??= {})[field] = value;
    }

    /** Set the rate (steps per beat) of what a layer plays now, keeping its
     *  position; the effect keeps that rate the next time it is triggered. */
    setLayerRate(layer, rate) {
        if (layer === 'color') {
            this.sequencer.setRate(rate);
        } else {
            const engine = this._engineFor(layer);
            if (!engine.active) return;
            engine.setRate(rate, this._beatNow());
            this._setTweak(layer, engine.active.name, 'rate', rate);
        }
        this.refreshPanel();
    }

    /** Set the easing curve of the movement or glow playing now. */
    setLayerEasing(layer, easing) {
        const engine = this._engineFor(layer);
        if (!engine.active) return;
        engine.setEasing(easing);
        this._setTweak(layer, engine.active.name, 'easing', easing);
        this.refreshPanel();
    }

    /** Scale what the movement or glow layer plays now (1 = as defined). */
    setLayerIntensity(layer, intensity) {
        const engine = this._engineFor(layer);
        if (!engine.active) return;
        engine.setIntensity(intensity);
        this._setTweak(layer, engine.active.name, 'intensity', intensity);
    }

    /** Per layer, the label of what actually plays and its rate, easing and
     *  intensity; null where the layer has nothing that moves. */
    nowPlaying() {
        const fromEngine = (engine, label) => ({
            label,
            rate: engine.active?.phase.rate ?? null,
            easing: engine.active?.easing ?? null,
            intensity: engine.active?.intensity ?? null,
        });
        const { pattern, variant } = this.sequencer;
        const patternLabel = pattern[0].toUpperCase() + pattern.slice(1) + (variant ? ' ⇄' : '');
        const staticGlow = this.currentGlowMode === 'static' ? 'Static' : 'None';
        return {
            color: { label: patternLabel, rate: this.sequencer.rate, easing: null, intensity: null },
            movement: fromEngine(this.effectEngine, EFFECTS[this.currentMovement]?.label ?? 'None'),
            glow: fromEngine(this.glowEngine, this.glowEngine.active?.def.label ?? staticGlow),
        };
    }

    /** Tweaks as plain data, for presets. */
    exportTweaks() {
        return structuredClone({ ...this.tweaks, color: this.sequencer.patternRates });
    }

    /** Replace the tweaks with stored ones, keeping only values the panel could have set. */
    importTweaks(saved) {
        this.resetTweaks();
        for (const layer of ['movement', 'glow']) {
            for (const [name, tweak] of Object.entries(saved?.[layer] ?? {})) {
                if (!tweak || typeof tweak !== 'object') continue;
                if (RATES.includes(tweak.rate)) this._setTweak(layer, name, 'rate', tweak.rate);
                if (isEasing(tweak.easing)) this._setTweak(layer, name, 'easing', tweak.easing);
                if (Number.isFinite(tweak.intensity) && tweak.intensity >= INTENSITY_MIN && tweak.intensity <= INTENSITY_MAX) {
                    this._setTweak(layer, name, 'intensity', tweak.intensity);
                }
            }
        }
        for (const [pattern, rate] of Object.entries(saved?.color ?? {})) {
            if (Object.hasOwn(PATTERN_RATES, pattern) && RATES.includes(rate)) this.sequencer.patternRates[pattern] = rate;
        }
    }

    resetTweaks() {
        this.tweaks = { movement: {}, glow: {} };
        this.sequencer.patternRates = {};
    }

    // --- Public API (called by shortcuts) ---

    /** The one entry point for scene changes: run `change` now, or hold it for
     *  the next commit while a cue is armed. Colors and the pattern stage in the
     *  sequencer itself; only the pattern's mood highlight drop goes through here. */
    _dispatch(change) {
        if (this.sequencer.staging) {
            this.stagedChanges.push(change);
        } else {
            change();
        }
    }

    /** A manual pattern leaves the mood, as a manual movement or glow does. */
    setPattern(pattern, variant = false) {
        this.sequencer.setPattern(pattern, variant);
        this.clearMood();
    }

    /** Play a movement effect (independent from color); rate and easing override its own. */
    playMovement(effectName, rate = null, easing = null) {
        this._dispatch(() => this._playMovement(effectName, rate, easing));
    }

    stopEffect() {
        this._dispatch(() => this._stopMovement());
    }

    /** Set the glow layer to a quick mode (glow-map.js); removed mode names are
     *  translated. rate and easing override the sequence's own. */
    setGlowMode(requestedMode, rate = null, easing = null) {
        this._dispatch(() => this._setGlowMode(requestedMode, rate, easing));
    }

    _playMovement(effectName, rate, easing) {
        const def = EFFECTS[effectName];
        if (!def) return;
        const settings = this._settingsFor('movement', effectName, def);
        if (rate) settings.rate = rate;
        if (easing) settings.easing = easing;
        this.effectEngine.play(effectName, def, settings, this._beatNow());
        this.currentMovement = effectName;
        this.currentMood = null;           // manual change drops the mood highlight
        this.refreshPanel();
    }

    _stopMovement() {
        this.effectEngine.stop();
        this.columnManager.resetOffsets();
        this.currentMovement = 'none';
        this.currentMood = null;
        this.refreshPanel();
    }

    _setGlowMode(requestedMode, rate, easing) {
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
            this.playGlowEffect(GLOW_MODE_SEQUENCE[mode] ?? mode, rate, easing);
        }
    }

    /** Glows are locked to the beat grid, so flashes land on the beat. */
    playGlowEffect(name, rate = null, easing = null) {
        const def = GLOW_SEQUENCES[name];
        if (!def) return;
        const settings = this._settingsFor('glow', name, def);
        if (rate) settings.rate = rate;
        if (easing) settings.easing = easing;
        this.glowEngine.play(name, def, settings, this._beatNow(), true);
    }

    stopGlowEffect() {
        this.glowEngine.stop();
        this.columnManager.setAllGlow(0);
        this.currentGlowMode = 'none';
        this.currentMood = null;
    }

    /** Apply a mood (mood-map.js): colors, pattern, movement, glow, BPM and a
     *  rate per layer, plus the movement and glow easings it names. Every layer
     *  starts at once, the color rotation from frame 0 even when it was paused.
     *  While a cue is armed the colors and pattern go to the pending combo and
     *  the rest waits for the commit.
     *  @param {object} mood - mood definition
     *  @param {string|null} moodKey - mood name, for the active-state highlight */
    applyMood(mood, moodKey = null) {
        this.sequencer.setColors(mood.colors);
        this.sequencer.setPattern(mood.pattern);
        this._dispatch(() => {
            this.sequencer.setBPM(mood.bpm);
            // A pattern pressed after the mood on the cue keeps its own rate.
            if (this.sequencer.pattern === mood.pattern) this.sequencer.setRate(mood.rates.color, false);
            this.sequencer.play(true);

            if (mood.movement && mood.movement !== 'none') {
                this._playMovement(mood.movement, mood.rates.movement, mood.easings?.movement);
            } else {
                this._stopMovement();
            }

            if (mood.glow && mood.glow !== 'none') {
                this._setGlowMode(mood.glow, mood.rates.glow, mood.easings?.glow);
            } else {
                this.stopGlowEffect();
            }

            // Set after the layer calls, which clear currentMood, so the mood button highlights.
            this.currentMood = moodKey;
            this.refreshPanel();
        });
    }

    /** Mood None: clear only the active-mood highlight. The live layers stay as
     *  they are; each has its own None button. */
    clearMood() {
        this._dispatch(() => {
            this.currentMood = null;
            this.refreshPanel();
        });
    }

    /** CUE (Backspace / panel Cue): stage a new combo while the live rotation
     *  keeps playing. Colors, pattern, movement, glow and mood pressed meanwhile
     *  wait for the commit, which starts from the base movement, glow and mood
     *  and replays them in press order; BPM stays live. Cueing again starts the
     *  combo over. */
    cue() {
        this.sequencer.startStaging(BASE_STATE.pattern, true);
        this.stagedChanges = [];
        this.refreshPanel();
    }

    /** Commit a cue (Space / panel Play while staging): pending -> live, play
     *  from 0, reset movement/glow/mood when the cue asked for it, then run the
     *  staged scene changes in press order. */
    commitCue() {
        const res = this.sequencer.commitStaged();
        if (res && res.fullReset) this._resetLayersToBase();
        const changes = this.stagedChanges;
        this.stagedChanges = [];
        for (const change of changes) change();
        this.refreshPanel();
    }

    /** Return every performance layer to BASE_STATE, BPM and playing with no
     *  colors included (Escape, Reset to Defaults). Layout, filters, rotation and the
     *  FPS cap are not performance layers and stay as they are. */
    resetToBase() {
        this.sequencer.resetToBase();
        this.stagedChanges = [];
        this._resetLayersToBase();
        this.refreshPanel();
    }

    /** Movement, glow and mood to BASE_STATE; the sequencer resets itself. */
    _resetLayersToBase() {
        if (BASE_STATE.movement === 'none') {
            this._stopMovement();
        } else {
            this._playMovement(BASE_STATE.movement, null, null);
        }
        this._setGlowMode(BASE_STATE.glow, null, null);
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

    /** Fade the text overlay in or out (key 9 / panel); refreshPanel refreshes the panel's Texto button. */
    toggleOverlay() {
        if (!this.overlay) return;
        this.overlay.toggle();
        this.refreshPanel();
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
            this.refreshPanel();
        } catch (e) {
            console.error('No camera could be reopened:', e);
        } finally {
            this._switchingCamera = false;
        }
    }

    /** Refresh the panel's live views (Now Playing, sequencer, Movimiento, Glow, Texto) from the app's state. */
    refreshPanel() {
        if (this.panel) this.panel.refreshSequencerUI();
    }

    // --- Main Loop ---
    // The video texture is not uploaded here: Pixi 8's VideoSource auto-updates
    // itself from requestVideoFrameCallback, once per new camera frame.
    update() {
        const now = performance.now();
        this.sequencer.update(now);
        const beat = this.sequencer.beatAt(now);
        this.columnManager.tickEffects(beat);

        const scaleFactor = this.pixiApp.screen.height / 1080;
        const offsets = this.effectEngine.compute(CONFIG.columns.count, scaleFactor, beat);
        if (offsets) {
            this.columnManager.applyOffsets(offsets);
        }

        const glowData = this.glowEngine.compute(CONFIG.columns.count, beat);
        if (glowData) {
            this.columnManager.applyGlowIntensities(glowData.intensity);
        }

        this.overlay.tick(now, beat, this.sequencer.selectedColors);
    }
}
