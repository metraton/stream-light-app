// --- Column Manager (layout, creation, color management) ---
import { CONFIG } from './config.js';

export class ColumnManager {
    constructor(pixiApp) {
        this.pixiApp = pixiApp;
        this.videoElement = null;
        this.videoTexture = null;
        this.columns = [];
        this.currentColorMode = 'RAINBOW';
        this.columnColors = [...CONFIG.colorOrder];
    }

    setVideo(videoElement, videoTexture) {
        this.videoElement = videoElement;
        this.videoTexture = videoTexture;
    }

    get count() {
        return this.columns.length;
    }

    create() {
        const width = this.pixiApp.screen.width;
        const height = this.pixiApp.screen.height;
        const { count, gap, margin, cornerRadius } = CONFIG.columns;
        const columnWidth = (width - 2 * margin - (count - 1) * gap) / count;
        const columnHeight = height - 2 * margin;

        const videoW = this.videoElement.videoWidth;
        const videoH = this.videoElement.videoHeight;
        // rotationSteps: 0=0°, 1=90°, 2=180°, 3=270° (clockwise).
        // Odd steps (90°/270°) swap the feed's effective width/height.
        const rotationSteps = ((CONFIG.columns.rotationSteps % 4) + 4) % 4;
        const swapDims = rotationSteps === 1 || rotationSteps === 3;

        const effectiveW = swapDims ? videoH : videoW;
        const effectiveH = swapDims ? videoW : videoH;

        const zoom = CONFIG.columns.zoom;
        const baseScale = columnHeight / effectiveH;
        const scale = baseScale * zoom;

        const scaledW = effectiveW * scale;

        const maxPan = scaledW - columnWidth;
        const spread = CONFIG.columns.spread;
        const cropStep = maxPan > 0 ? (maxPan * spread) / (count - 1) : 0;

        const totalSpread = cropStep * (count - 1);
        const startOffset = (maxPan - totalSpread) / 2;

        for (let i = 0; i < count; i++) {
            const screenX = margin + i * (columnWidth + gap);
            const screenY = margin;

            const container = new PIXI.Container();
            container.x = screenX;
            container.y = screenY;

            const maskGfx = new PIXI.Graphics();
            maskGfx.roundRect(0, 0, columnWidth, columnHeight, cornerRadius);
            maskGfx.fill({ color: 0xffffff });
            container.addChild(maskGfx);
            container.mask = maskGfx;

            const sprite = new PIXI.Sprite(this.videoTexture);
            sprite.anchor.set(0.5, 0.5);

            // Orientation: rotationSteps * 90° clockwise (0/90/180/270).
            sprite.rotation = rotationSteps * (Math.PI / 2);

            sprite.scale.set(scale);

            const panOffset = startOffset + cropStep * i;
            sprite.x = scaledW / 2 - panOffset;
            sprite.y = columnHeight / 2;

            // Color filter (brightness, contrast, saturation)
            const colorMatrix = new PIXI.ColorMatrixFilter();
            sprite.filters = [colorMatrix];

            container.addChild(sprite);

            // Glow: GlowFilter on a shape behind the column
            const g = CONFIG.glow;
            const glowContainer = new PIXI.Container();
            glowContainer.x = screenX;
            glowContainer.y = screenY;

            const glowGfx = new PIXI.Graphics();
            glowGfx.roundRect(0, 0, columnWidth, columnHeight, cornerRadius);
            glowGfx.fill({ color: 0xffffff });

            const colorName = CONFIG.colorOrder[i];
            const glowColor = g.colorMode === 'white' ? 0xffffff
                : g.colorMode === 'custom' ? g.customColor
                : (CONFIG.colors[colorName] || 0xffffff);

            const glowFilter = new PIXI.filters.GlowFilter({
                distance: g.distance,
                outerStrength: g.outerStrength,
                innerStrength: g.innerStrength,
                quality: g.quality,
                color: glowColor,
                knockout: true,
            });
            glowGfx.filters = [glowFilter];

            glowContainer.addChild(glowGfx);
            glowContainer.alpha = g.intensity;

            // Glow goes behind column
            this.pixiApp.stage.addChild(glowContainer);
            this.pixiApp.stage.addChild(container);

            this.columns.push({
                container,
                sprite,
                maskGfx,
                colorMatrix,
                glowContainer,
                glowGfx,
                glowFilter,
                baseX: screenX,
                baseY: screenY,
                width: columnWidth,
                height: columnHeight,
                index: i,
                offsetX: 0,
                offsetY: 0,
            });
        }
        this.applyFilters();
    }

    rebuild() {
        for (const col of this.columns) {
            this.pixiApp.stage.removeChild(col.container);
            if (col.glowContainer) this.pixiApp.stage.removeChild(col.glowContainer);
        }
        this.columns = [];
        this.create();
        this.refreshColors();
        this.applyFilters();
    }

    // --- Filters (per-column: brightness, contrast, saturation, hue, temperature) ---
    applyFilters(columnIndex) {
        const f = CONFIG.filters;
        const nf = CONFIG.neutralFilter;
        const start = columnIndex !== undefined ? columnIndex : 0;
        const end = columnIndex !== undefined ? columnIndex + 1 : this.columns.length;

        for (let i = start; i < end; i++) {
            if (!this.columns[i]) continue;
            const cm = this.columns[i].colorMatrix;
            cm.reset();

            const isNeutral = this.columnColors[i] === 'NEUTRAL';
            const b = isNeutral ? (nf.brightness || 0) : (f.brightness[i] || 0);
            const c = isNeutral ? (nf.contrast ?? 1)   : (f.contrast[i] ?? 1);
            const s = isNeutral ? (nf.saturation ?? 1)  : (f.saturation[i] ?? 1);
            const h = isNeutral ? (nf.hue || 0)         : (f.hue[i] || 0);
            const t = isNeutral ? (nf.temperature || 0)  : (f.temperature[i] || 0);

            let chained = false;
            if (b !== 0) { cm.brightness(1 + b / 100, chained); chained = true; }
            if (c !== 1) { cm.contrast(c - 1, chained); chained = true; }
            if (s !== 1) { cm.saturate(s - 1, chained); chained = true; }
            if (h !== 0) { cm.hue(h, chained); chained = true; }
            if (t !== 0) {
                const tn = t / 100;
                cm._loadMatrix([
                    1 + tn * 0.15, 0, 0, 0, tn * 0.02,
                    0, 1 + tn * 0.03, 0, 0, 0,
                    0, 0, 1 - tn * 0.15, 0, -tn * 0.02,
                    0, 0, 0, 1, 0,
                ], chained);
            }
        }
    }

    // --- Color Management ---
    setAllColors(colorName) {
        const tint = CONFIG.colors[colorName];
        if (tint === undefined) return;
        this.currentColorMode = colorName;
        for (let i = 0; i < this.columns.length; i++) {
            this.columns[i].sprite.tint = tint;
            this.columnColors[i] = colorName;
        }
        this.updateGlowColors();
    }

    setRainbow() {
        this.currentColorMode = 'RAINBOW';
        for (let i = 0; i < this.columns.length; i++) {
            const colorName = CONFIG.colorOrder[i];
            const tint = CONFIG.colors[colorName];
            this.columns[i].sprite.tint = tint;
            this.columnColors[i] = colorName;
        }
        this.updateGlowColors();
    }

    setColumnColor(index, colorName) {
        const tint = CONFIG.colors[colorName];
        if (tint === undefined || !this.columns[index]) return;
        this.columns[index].sprite.tint = tint;
        this.columnColors[index] = colorName;
    }

    refreshColors() {
        if (this.currentColorMode === 'RAINBOW') {
            this.setRainbow();
        } else {
            this.setAllColors(this.currentColorMode);
        }
    }

    // --- Glow ---
    setGlow(index, intensity) {
        const col = this.columns[index];
        if (!col || !col.glowContainer) return;
        col.glowContainer.alpha = Math.max(0, Math.min(1, intensity));
    }

    setAllGlow(intensity) {
        for (let i = 0; i < this.columns.length; i++) {
            this.setGlow(i, intensity);
        }
    }

    applyGlowIntensities(intensities) {
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            if (!col.glowContainer) continue;
            col.glowContainer.alpha = Math.max(0, Math.min(1, intensities[i] || 0));
        }
    }

    updateGlowColors() {
        const g = CONFIG.glow;
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            if (!col.glowFilter) continue;
            if (g.colorMode === 'white') {
                col.glowFilter.color = 0xffffff;
            } else if (g.colorMode === 'custom') {
                col.glowFilter.color = g.customColor;
            } else {
                const colorName = this.columnColors[i];
                col.glowFilter.color = colorName === 'NEUTRAL'
                    ? 0xffffff
                    : (CONFIG.colors[colorName] || 0xffffff);
            }
        }
    }

    updateGlowParams() {
        const g = CONFIG.glow;
        for (const col of this.columns) {
            if (!col.glowFilter) continue;
            col.glowFilter.outerStrength = g.outerStrength;
            col.glowFilter.innerStrength = g.innerStrength;
            col.glowContainer.alpha = g.intensity;
        }
        this.updateGlowColors();
    }

    // --- Offsets (from effect engine) ---
    // Edge-clamping: every movement is bounded so a column never clips the
    // screen edges. The column rect is [baseX..baseX+width] × [baseY..baseY+height];
    // the screen is [0..screenW] × [0..screenH]. We keep the rect inside the
    // screen minus SAFETY px on each side, for translation (x/y) and for
    // vertical scaling (scaleY, used by Equalizer — which scales from center).
    applyOffsets(offsets) {
        if (!offsets) return;
        const SAFETY = 2; // px margin kept from each screen edge
        const screenW = this.pixiApp.screen.width;
        const screenH = this.pixiApp.screen.height;

        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];

            // --- Clamp X translation to the screen's horizontal bounds ---
            let ox = offsets.offsetX[i] || 0;
            const minOx = (SAFETY) - col.baseX;                       // left edge
            const maxOx = (screenW - SAFETY) - (col.baseX + col.width); // right edge
            ox = Math.max(minOx, Math.min(maxOx, ox));

            // --- Clamp Y translation to the screen's vertical bounds ---
            let oy = offsets.offsetY[i] || 0;
            const minOy = (SAFETY) - col.baseY;                        // top edge
            const maxOy = (screenH - SAFETY) - (col.baseY + col.height); // bottom edge
            oy = Math.max(minOy, Math.min(maxOy, oy));

            col.container.x = col.baseX + ox;
            col.container.y = col.baseY + oy;
            if (col.glowContainer) {
                col.glowContainer.x = col.baseX + ox;
                col.glowContainer.y = col.baseY + oy;
            }

            // Scale Y: scale from center
            let sy = offsets.scaleY?.[i] || 0;
            if (sy !== 0) {
                // Scaling from the vertical center grows the column by
                // height*(scale-1)/2 beyond EACH end. Cap the scale so neither
                // end (already offset by oy) crosses the safety bound.
                const topRoom = (col.baseY + oy) - SAFETY;                       // px above
                const botRoom = (screenH - SAFETY) - (col.baseY + oy + col.height); // px below
                const room = Math.max(0, Math.min(topRoom, botRoom));
                const maxGrow = col.height > 0 ? (2 * room) / col.height : 0;     // max (scale-1)
                if (sy > maxGrow) sy = maxGrow; // only positive growth can clip
                const scale = 1 + sy;
                col.container.pivot.y = col.height / 2;
                col.container.y = col.baseY + oy + col.height / 2;
                col.container.scale.y = scale;
                if (col.glowContainer) {
                    col.glowContainer.pivot.y = col.height / 2;
                    col.glowContainer.y = col.baseY + oy + col.height / 2;
                    col.glowContainer.scale.y = scale;
                }
            } else {
                col.container.pivot.y = 0;
                col.container.scale.y = 1;
                if (col.glowContainer) {
                    col.glowContainer.pivot.y = 0;
                    col.glowContainer.scale.y = 1;
                }
            }
        }
    }

    resetOffsets() {
        for (const col of this.columns) {
            col.offsetX = 0;
            col.offsetY = 0;
            col.container.x = col.baseX;
            col.container.y = col.baseY;
            col.container.pivot.y = 0;
            col.container.scale.y = 1;
            if (col.glowContainer) {
                // Reset glow position too (not just pivot/scale) — otherwise a
                // glow left on after a movement stops stays at its last-moved
                // spot and looks misaligned / "half" relative to the column.
                col.glowContainer.x = col.baseX;
                col.glowContainer.y = col.baseY;
                col.glowContainer.pivot.y = 0;
                col.glowContainer.scale.y = 1;
            }
        }
    }
}
