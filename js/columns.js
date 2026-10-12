// --- Column Manager (layout, creation, color management) ---
import { CONFIG } from './config.js';
import { effectiveFilter, isNeutral } from './color-filter.js';
import { resolveEffects, chainKey } from './effect-stack.js';
import { effectById, runsOnBeat } from './effects-registry.js';
import { ScreenLayer } from './screen-layer.js';

// ============================================================================
// UNIFIED MOVEMENT MARGIN RULE  (single source of truth — tune here)
// ----------------------------------------------------------------------------
// Every movement (Wave, Broken, Shake, Expand, Equalizer) is clamped so a
// column's visual edge never comes closer to the screen edge than a RESERVE,
// leaving consistent breathing room at top/bottom (and left/right) at ANY
// margin value and ANY screen size.
//
// The reserve is a PERCENTAGE OF THE LAYOUT MARGIN, not a fixed pixel count
// and not a percentage of the screen. Rationale:
//   * It respects the user's actual margin setting — a bigger margin yields a
//     proportionally bigger reserve, so the feel is consistent as the margin
//     changes (the explicit requirement).
//   * It is screen-size independent: the margin is the chosen reference, so a
//     larger viewport does not let movements creep toward the edge.
//   * It is derived from the well-behaved movements: at margin=20, Wave's
//     ±15px extreme leaves ~5px (25% of the margin) of breathing room and
//     "reaches almost the end" — exactly the reference feel the user named.
// A 2px absolute floor guards the hard screen edge when margin is near 0.
const EDGE_RESERVE_FRACTION = 0.25; // keep 25% of the margin as breathing room
const EDGE_RESERVE_FLOOR = 2;       // px hard floor at the screen edge (margin≈0)

/** The px gap to keep between any column edge and the screen edge, derived
 *  from the current layout margin. One rule, used by translation AND scale. */
function edgeReserve() {
    return Math.max(EDGE_RESERVE_FLOOR, CONFIG.columns.margin * EDGE_RESERVE_FRACTION);
}

/** Load `cm` with the color adjust `settings`, replacing what it held. */
function loadColorMatrix(cm, settings) {
    cm.reset();
    const { brightness: b, contrast: c, saturation: s, hue: h, temperature: t } = settings;
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

export class ColumnManager {
    constructor(pixiApp) {
        this.pixiApp = pixiApp;
        // Every column and glow is drawn into this layer, which runs the Pantalla
        // effects; it outlives rebuild(), so the effects survive a layout change.
        this.screenLayer = new ScreenLayer(pixiApp, CONFIG.screenEffects);
        this.videoElement = null;
        this.videoTexture = null;
        this.columns = [];
        // Per-column logical color (name or 'NEUTRAL'), the source of truth for
        // glow color + neutral-filter selection. Colors are driven entirely by
        // the ColorSequencer (app._applyColorFrame writes here); there is no
        // separate "color mode" — that legacy concept caused rebuild() to snap
        // back to RAINBOW and is removed.
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

            // Color filter (brightness, contrast, saturation); applyFilters() attaches it.
            const colorMatrix = new PIXI.ColorMatrixFilter();

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
            this._setGlowAlpha(glowContainer, g.intensity);

            // Glow goes behind column
            this.screenLayer.container.addChild(glowContainer);
            this.screenLayer.container.addChild(container);

            this.columns.push({
                container,
                sprite,
                maskGfx,
                colorMatrix,
                // Effect filters by id, created on first use and kept while the column lives.
                effectFilters: new Map(),
                // The entries of the current chain that tickEffects() drives, refreshed by applyFilters().
                beatEffects: [],
                filterKey: null,
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

    /** Recreate every column for the current layout, releasing the old columns' GPU resources but not the shared video texture. */
    rebuild() {
        for (const col of this.columns) {
            this.screenLayer.container.removeChild(col.container, col.glowContainer);
            // destroy() keeps sprite textures unless asked ({ texture: true }), so the video survives.
            col.container.destroy({ children: true });
            col.glowContainer.destroy({ children: true });
            col.colorMatrix.destroy();
            for (const filter of col.effectFilters.values()) filter.destroy();
            col.glowFilter.destroy();
        }
        this.columns = [];
        this.create();
        this.applyFilters();
        // NOTE: rebuild() no longer re-applies colors itself. The caller must
        // re-apply the ColorSequencer's current frame (app.reapplyColors())
        // right after, so the live combo (e.g. calm = solid blue) is restored
        // with NO intermediate rainbow flash. create() leaves sprites at their
        // default white tint, which is overwritten synchronously by the frame.
    }

    // --- Filters: color adjust (global + per-color offset), then the color's effects ---
    /**
     * Give every column the filter chain of the color it currently shows:
     * [color adjust, ...effects]. Adjust and effects are looked up by color slot
     * in CONFIG.colorOrder, not by column position, because the sequencer moves
     * colors between columns. The `filters` array is replaced only when the chain
     * changes; otherwise the existing filters get new uniforms. Each filter is a
     * render pass, so a neutral adjust is left out and an empty chain is null.
     */
    applyFilters() {
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            const colorName = this.columnColors[i];
            // An uncolored ('NEUTRAL') column has slot -1 and gets the global values alone.
            const slot = CONFIG.colorOrder.indexOf(colorName);
            const settings = effectiveFilter(CONFIG.colorFilter, slot);
            const adjust = !isNeutral(settings);
            if (adjust) loadColorMatrix(col.colorMatrix, settings);

            const effects = resolveEffects(CONFIG.effectStack, slot);
            const context = { color: slot === -1 ? null : CONFIG.colors[colorName] };
            const effectFilters = effects.map(({ id, params }) => this._effectFilter(col, id, params, context));
            col.beatEffects = effects.flatMap(({ id, params }, index) => {
                const effect = effectById(id);
                return runsOnBeat(effect, params) ? [{ effect, filter: effectFilters[index], params }] : [];
            });

            const key = (adjust ? 'adjust+' : '') + chainKey(effects);
            if (key === col.filterKey) continue;
            col.filterKey = key;
            const chain = adjust ? [col.colorMatrix, ...effectFilters] : effectFilters;
            col.sprite.filters = chain.length > 0 ? chain : null;
        }
    }

    /**
     * Advance the beat-driven effects, per column and on the screen layer, to
     * `beat` (the master clock's continuous beat position); each part returns
     * at once when it runs none.
     */
    tickEffects(beat) {
        this.screenLayer.tick(beat);
        if (!this.columns.some(col => col.beatEffects.length > 0)) return;
        const beatIndex = Math.floor(beat);
        const timing = { beatPhase: beat - beatIndex, beatIndex };
        for (const col of this.columns) {
            for (const { effect, filter, params } of col.beatEffects) effect.tick(filter, params, timing);
        }
    }

    /** The column's filter for effect `id`, created on first use, with `params` applied. */
    _effectFilter(col, id, params, context) {
        const effect = effectById(id);
        let filter = col.effectFilters.get(id);
        if (filter) {
            effect.update(filter, params, context);
        } else {
            filter = effect.create(params, context);
            col.effectFilters.set(id, filter);
        }
        return filter;
    }

    // --- Glow ---
    /** Set a glow layer's opacity, clamped to 0-1, and skip drawing it entirely while it is 0. */
    _setGlowAlpha(glowContainer, intensity) {
        glowContainer.alpha = Math.max(0, Math.min(1, intensity));
        glowContainer.visible = glowContainer.alpha > 0;
    }

    setGlow(index, intensity) {
        const col = this.columns[index];
        if (!col || !col.glowContainer) return;
        this._setGlowAlpha(col.glowContainer, intensity);
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
            this._setGlowAlpha(col.glowContainer, intensities[i] || 0);
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
            this._setGlowAlpha(col.glowContainer, g.intensity);
        }
        this.updateGlowColors();
    }

    // --- Offsets (from effect engine) ---
    // Edge-clamping: every movement is bounded by ONE shared rule (edgeReserve)
    // so a column's edge never comes closer to the screen edge than a reserve
    // proportional to the layout margin. The column rect is
    // [baseX..baseX+width] × [baseY..baseY+height]; the screen is
    // [0..screenW] × [0..screenH]. The same reserve governs translation (x/y,
    // used by Wave/Broken/Shake/Expand) AND vertical scaling (scaleY, used by
    // Equalizer — which grows from center), so every movement leaves the same
    // consistent breathing room.
    applyOffsets(offsets) {
        if (!offsets) return;
        const reserve = edgeReserve(); // ONE rule for all movements (px from edge)
        const screenW = this.pixiApp.screen.width;
        const screenH = this.pixiApp.screen.height;

        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];

            // --- Clamp X translation to the screen's horizontal bounds ---
            let ox = offsets.offsetX[i] || 0;
            const minOx = (reserve) - col.baseX;                       // left edge
            const maxOx = (screenW - reserve) - (col.baseX + col.width); // right edge
            ox = Math.max(minOx, Math.min(maxOx, ox));

            // --- Clamp Y translation to the screen's vertical bounds ---
            let oy = offsets.offsetY[i] || 0;
            const minOy = (reserve) - col.baseY;                        // top edge
            const maxOy = (screenH - reserve) - (col.baseY + col.height); // bottom edge
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
                // height*(scale-1)/2 beyond EACH end. It uses the SAME edge
                // reserve as translation: the grown edge may breathe toward the
                // screen edge but must stop `reserve` px short of it. Because
                // the reserve is a fraction of the margin, Equalizer now leaves
                // the same proportional breathing room as Wave/Broken at ANY
                // margin value — it can no longer slam the top/bottom edges.
                const topRoom = (col.baseY + oy) - reserve;                       // px above to reserve line
                const botRoom = (screenH - reserve) - (col.baseY + oy + col.height); // px below to reserve line
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
