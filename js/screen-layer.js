// --- Screen layer: the container every column and glow is drawn into, and the Pantalla effects on it ---
// The effects are filters on this one container, so each is one pass over the
// whole frame however many columns there are. With none on, `filters` is null
// and the layer costs what a plain container does. A filter lives only while
// its effect is on: turning the effect off destroys it and frees its GPU memory.
//
// Estelas is the exception: it needs the previous frame, which a filter cannot
// keep. While it is on, `container` leaves the stage and keeps only the effects
// before Estelas; the TrailsPass renders it each frame and its sprite stands in
// `root`, which carries the effects after Estelas.
import { screenEffectById, TrailsPass } from './screen-effects.js';
import { runsOnBeat } from './effects-registry.js';
import { chainKey } from './effect-stack.js';

export class ScreenLayer {
    /** A layer added to `pixiApp`'s stage that runs the effects in `list` (CONFIG.screenEffects). */
    constructor(pixiApp, list) {
        const { width, height } = pixiApp.screen;
        this.list = list;
        this.context = { width, height };
        this.renderer = pixiApp.renderer;
        this.ticker = pixiApp.ticker;
        // A fixed full-stage area keeps every filter's input the same size and
        // place while movements shift the columns.
        const area = new PIXI.Rectangle(0, 0, width, height);
        this.container = new PIXI.Container();
        this.container.filterArea = area;
        this.root = new PIXI.Container();
        this.root.filterArea = area;
        this.root.addChild(this.container);
        pixiApp.stage.addChild(this.root);
        this.filters = new Map();
        this.chain = [];
        this.trails = null;
        this.beatEffects = [];
        this.key = '';
    }

    /** Bring the filters in line with the list: create what was turned on, update params, destroy what was turned off. */
    apply() {
        this.chain = this.list.map(({ id, params }) => this._filter(id, params));
        this.trails = this.chain.find(pass => pass instanceof TrailsPass) ?? null;
        this.beatEffects = this.list.flatMap(({ id, params }, index) => {
            const effect = screenEffectById(id);
            return runsOnBeat(effect, params) ? [{ effect, filter: this.chain[index], params }] : [];
        });
        const key = chainKey(this.list);
        if (key !== this.key) {
            this.key = key;
            this._mount();
        }
        for (const [id, filter] of this.filters) {
            if (this.list.some(entry => entry.id === id)) continue;
            this.filters.delete(id);
            filter.destroy();
        }
    }

    /** Advance the effects that follow the clock to `beat`, its continuous beat position. */
    tick(beat) {
        if (this.beatEffects.length === 0) return;
        const beatIndex = Math.floor(beat);
        const timing = { beatPhase: beat - beatIndex, beatIndex };
        for (const { effect, filter, params } of this.beatEffects) effect.tick(filter, params, timing);
    }

    /**
     * Put the chain on the stage: every filter on `container` without a working
     * Estelas; with one, the filters before it on `container`, the trail sprite
     * in `root` in its place, the filters after it on `root`, and the trail
     * drawn every frame.
     */
    _mount() {
        const trails = this.trails && !this.trails.failed ? this.trails : null;
        const at = this.chain.indexOf(trails);
        const before = trails ? this.chain.slice(0, at) : this.chain.filter(pass => !(pass instanceof TrailsPass));
        const after = trails ? this.chain.slice(at + 1) : [];
        this.container.filters = before.length > 0 ? before : null;
        this.root.filters = after.length > 0 ? after : null;
        this.root.removeChildren();
        this.root.addChild(trails ? trails.sprite : this.container);
        this.ticker.remove(this._drawTrails, this);
        // After App.update moves the columns (NORMAL) and before Pixi renders
        // the stage (LOW), so the trail holds this frame's layout.
        if (trails) this.ticker.add(this._drawTrails, this, PIXI.UPDATE_PRIORITY.LOW + 1);
    }

    /** Add this frame to the trail; a failed pipeline falls back to the plain layer. */
    _drawTrails() {
        if (!this.trails.draw(this.renderer, this.container)) this._mount();
    }

    /** The filter for effect `id`, created when the effect is turned on, with `params` applied. */
    _filter(id, params) {
        const effect = screenEffectById(id);
        let filter = this.filters.get(id);
        if (filter) {
            effect.update(filter, params, this.context);
        } else {
            filter = effect.create(params, this.context);
            this.filters.set(id, filter);
        }
        return filter;
    }
}
