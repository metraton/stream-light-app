// --- Text overlay: the on-demand phrase (key 9), drawn above the screen layer ---
// The container is a direct child of the stage, added after the screen layer's
// container, so the Pantalla filters never reach it; moveToTop() restores that
// order after anything else is added to the stage.
import { CONFIG } from './config.js';
import {
    TEXT_FONT_FAMILY, TEXT_FONT_WEIGHT, WHITE, fadeAlpha, fadeDuration, flickerLevel, pulseGlow, textColor, textCenterY,
} from './overlay-text.js';

const GLOW = { distance: 18, outerStrength: 2.5, quality: 0.3 };
// Line and gap of the double outline, as fractions of the font size.
const LINE_FACTOR = 0.022;
const GAP_FACTOR = 0.04;
const LETTER_SPACING_FACTOR = 0.08;
const BAND_HEIGHT_FACTOR = 1.5;
// The phrase is scaled down to fit this share of the stage width.
const MAX_WIDTH_SHARE = 0.94;

const fontSpec = size => `${TEXT_FONT_WEIGHT} ${size}px "${TEXT_FONT_FAMILY}", sans-serif`;

/** Resolves with the overlay font's loaded faces, or [] when loading fails.
 *  A stalled request never settles, so callers must not gate startup on it. */
export async function loadOverlayFont() {
    // index.html loads this stylesheet non-blocking, so its @font-face may not exist yet;
    // loading before it does would resolve [] at once.
    const link = document.querySelector('link[href*="family=Fredoka"]');
    if (link && !link.sheet) {
        await new Promise(resolve => {
            link.addEventListener('load', resolve, { once: true });
            link.addEventListener('error', resolve, { once: true });
        });
    }
    return document.fonts.load(fontSpec(100)).catch(() => []);
}

/** A white canvas of `phrase` as hollow letters outlined by two thin lines: a
 *  wide stroke, then a narrower one erased from its middle; nothing is filled. */
function drawDoubleOutline(phrase, size) {
    const line = Math.max(2, Math.round(size * LINE_FACTOR));
    const gap = Math.max(3, Math.round(size * GAP_FACTOR));
    const outer = 2 * line + gap;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const setFont = () => {
        ctx.font = fontSpec(size);
        ctx.letterSpacing = `${Math.round(size * LETTER_SPACING_FACTOR)}px`;
    };
    setFont();
    const pad = Math.ceil(outer + size * 0.1);
    canvas.width = Math.ceil(ctx.measureText(phrase).width) + 2 * pad;
    canvas.height = Math.ceil(size * 1.3) + 2 * pad;
    // Resizing a canvas resets its context, so the font is set again.
    setFont();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    ctx.lineWidth = outer;
    ctx.strokeText(phrase, x, y);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = gap;
    ctx.strokeText(phrase, x, y);
    return canvas;
}

export class Overlay {
    constructor(pixiApp) {
        this.pixiApp = pixiApp;
        this.container = null;
        this.band = null;
        this.sprite = null;
        this.glow = null;
        this.visible = false;
        this.alpha = 0;
        this.fade = { from: 0, to: 0, start: 0 };
        this.flickerSeed = Math.floor(Math.random() * 2 ** 31);
    }

    create() {
        this.container = new PIXI.Container();
        this.band = new PIXI.Graphics();
        this.sprite = new PIXI.Sprite();
        this.sprite.anchor.set(0.5);
        this.glow = new PIXI.filters.GlowFilter({ ...GLOW, color: WHITE });
        this.sprite.filters = [this.glow];
        this.container.addChild(this.band, this.sprite);
        this.container.visible = false;
        this.pixiApp.stage.addChild(this.container);
        this.refresh();
    }

    /** Redraw the phrase, band and position from CONFIG.text; color and beat behavior follow every frame. */
    refresh() {
        const { phrase, size, band, bandOpacity, position } = CONFIG.text;
        const { width, height } = this.pixiApp.screen;
        const canvas = drawDoubleOutline(phrase, size);
        const old = this.sprite.texture;
        this.sprite.texture = PIXI.Texture.from(canvas);
        if (old !== PIXI.Texture.EMPTY) old.destroy(true);
        const fit = Math.min(1, (width * MAX_WIDTH_SHARE) / canvas.width);
        this.sprite.scale.set(fit);
        const y = textCenterY(position, height);
        this.sprite.position.set(width / 2, y);
        const bandHeight = size * fit * BAND_HEIGHT_FACTOR;
        this.band.clear().rect(0, y - bandHeight / 2, width, bandHeight).fill({ color: 0x000000, alpha: bandOpacity });
        this.band.visible = band;
    }

    /** Fade the text in or out from wherever the current fade has reached. */
    setVisible(visible, now = performance.now()) {
        this.visible = visible;
        this.fade = { from: this.alpha, to: visible ? 1 : 0, start: now };
    }

    toggle(now = performance.now()) {
        this.setVisible(!this.visible, now);
    }

    /** Advance the fade, color and beat behavior; `beat` is the clock's continuous beat position. */
    tick(now, beat, selectedColors) {
        const { from, to, start } = this.fade;
        this.alpha = fadeAlpha(from, to, now - start, fadeDuration(from, to));
        this.container.visible = this.alpha > 0;
        if (!this.container.visible) return;
        const settings = CONFIG.text;
        const color = textColor(settings, selectedColors, CONFIG.colors, CONFIG.colorOrder);
        const flicker = settings.beat === 'flicker' ? flickerLevel(this.flickerSeed, now) : 1;
        const pulse = settings.beat === 'pulse' ? pulseGlow(beat) : 1;
        this.sprite.tint = color;
        this.sprite.alpha = flicker;
        this.glow.color = color;
        this.glow.outerStrength = GLOW.outerStrength * pulse * flicker;
        this.container.alpha = this.alpha;
    }

    /** Put the overlay back above the screen layer (call after a column rebuild). */
    moveToTop() {
        if (this.container) {
            this.pixiApp.stage.removeChild(this.container);
            this.pixiApp.stage.addChild(this.container);
        }
    }
}
