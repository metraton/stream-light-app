// --- Effect registry: the per-color effects a column can run after its color adjust ---
// Each effect is { id, label, defaults, params, create(params, context), update(filter, params, context) }.
// `params` describes the panel controls: a slider ({ key, label, min, max,
// decimals }) or a button choice ({ key, label, options: [{ value, label }] }).
// `context.color` is the hex of the color the column shows, null when uncolored.
// create() and update() reach the PIXI global only when called, so the
// definitions load in Node for the stack tests. Every effect is one more
// render pass, paid only by the columns whose color runs it.

const WHITE = 0xffffff;

// pixi-filters AsciiFilter: glyphs are picked by the luminance of each cell and
// drawn in one flat color. A 10px cell gives ~36 glyphs across a 1080p column,
// small enough to read as text and large enough to survive stream compression.
const ascii = {
    id: 'ascii',
    label: 'ASCII',
    defaults: { size: 10, color: 'column' },
    params: [
        { key: 'size', label: 'Celda', min: 4, max: 32, decimals: 0 },
        { key: 'color', label: 'Color', options: [{ value: 'column', label: 'Columna' }, { value: 'white', label: 'Blanco' }] },
    ],
    create(params, context) {
        const filter = new PIXI.filters.AsciiFilter({ size: params.size, color: WHITE, replaceColor: true });
        ascii.update(filter, params, context);
        return filter;
    },
    update(filter, params, context) {
        filter.size = params.size;
        filter.replaceColor = true;
        filter.color = params.color === 'white' || context.color === null ? WHITE : context.color;
    },
};

export const EFFECTS = [ascii];

/** The definition registered under `id`, undefined when there is none. */
export function effectById(id) {
    return EFFECTS.find(effect => effect.id === id);
}
