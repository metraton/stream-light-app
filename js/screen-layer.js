// --- Screen layer: the container every column and glow is drawn into, and the Pantalla effects on it ---
// The effects are filters on this one container, so each is one pass over the
// whole frame however many columns there are. With none on, `filters` is null
// and the layer costs what a plain container does. A filter lives only while
// its effect is on: turning the effect off destroys it and frees its GPU memory.
import { screenEffectById } from './screen-effects.js';
import { runsOnBeat } from './effects-registry.js';
import { chainKey } from './effect-stack.js';

export class ScreenLayer {
    /** A layer added to `pixiApp`'s stage that runs the effects in `list` (CONFIG.screenEffects). */
    constructor(pixiApp, list) {
        const { width, height } = pixiApp.screen;
        this.list = list;
        this.context = { width, height };
        this.container = new PIXI.Container();
        // A fixed full-stage area keeps every filter's input the same size and
        // place while movements shift the columns; Estelas lines frames up by it.
        this.container.filterArea = new PIXI.Rectangle(0, 0, width, height);
        pixiApp.stage.addChild(this.container);
        this.filters = new Map();
        this.beatEffects = [];
        this.key = '';
    }

    /** Bring the filters in line with the list: create what was turned on, update params, destroy what was turned off. */
    apply() {
        const chain = this.list.map(({ id, params }) => this._filter(id, params));
        this.beatEffects = this.list.flatMap(({ id, params }, index) => {
            const effect = screenEffectById(id);
            return runsOnBeat(effect, params) ? [{ effect, filter: chain[index], params }] : [];
        });
        const key = chainKey(this.list);
        if (key !== this.key) {
            this.key = key;
            this.container.filters = chain.length > 0 ? chain : null;
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
