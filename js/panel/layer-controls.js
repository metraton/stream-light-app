// --- "Sonando ahora": what each layer plays now, with the panel's only rate and easing ---
// Every button acts on the effect playing now (app.nowPlaying), never on a selection.
import { RATES, RATE_LABELS } from '../tempo.js';

const LAYERS = [
    { layer: 'color',    title: 'Color',      hasEasing: false },
    { layer: 'movement', title: 'Movimiento', hasEasing: true },
    { layer: 'glow',     title: 'Glow',       hasEasing: true },
];

// Labels match perceived behavior, not the math name: at these rates the
// ease-in-out curves dwell at each keyframe and read as a pulse, while linear
// reads as continuous. 'Destello' is Pulse's own flash-and-hold curve.
export const EASING_MODES = [
    { label: 'Suave',          curve: 'linear' },
    { label: 'Pulsada',        curve: 'easeInOutSine' },
    { label: 'Pulsada fuerte', curve: 'easeInOutCubic' },
    { label: 'Corte',          curve: 'step' },
    { label: 'Destello',       curve: ['expDecay', 'step'] },
];

export const sameCurve = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One row of equal-width buttons; clicking one calls onPick with its index. */
export function buttonRow(parent, labels, onPick) {
    const row = document.createElement('div');
    row.className = 'btn-grid';
    const btns = labels.map((label, i) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.addEventListener('click', () => onPick(i));
        row.appendChild(btn);
        return btn;
    });
    parent.appendChild(row);
    return btns;
}

/** A "Title: value" line naming what a layer plays now; returns the value's setter. */
export function activeLine(parent, title) {
    const line = document.createElement('div');
    line.className = 'active-line';
    const label = document.createElement('span');
    label.className = 'active-label';
    label.textContent = `${title}:`;
    const value = document.createElement('span');
    value.className = 'active-value';
    line.append(label, value);
    parent.appendChild(line);
    return text => { value.textContent = text; };
}

/** Mark the button isOn picks as active; with nothing playing every button is disabled. */
function highlight(btns, isOn, disabled) {
    btns.forEach((btn, i) => {
        btn.disabled = disabled;
        btn.classList.toggle('is-active', !disabled && isOn(i));
    });
}

/** Builds the "Sonando ahora" block; returns its refresh callback. */
export function createNowPlaying(parent, app) {
    const header = document.createElement('div');
    header.className = 'subhead';
    header.textContent = 'Sonando ahora';
    parent.appendChild(header);

    const rows = LAYERS.map(({ layer, title, hasEasing }) => {
        const group = document.createElement('div');
        group.className = 'layer-group';
        parent.appendChild(group);
        const setName = activeLine(group, title);
        const rateBtns = buttonRow(group, RATES.map(r => RATE_LABELS.get(r)),
            i => app.setLayerRate(layer, RATES[i]));
        const easingBtns = hasEasing
            ? buttonRow(group, EASING_MODES.map(m => m.label),
                i => app.setLayerEasing(layer, EASING_MODES[i].curve))
            : [];
        return { layer, setName, rateBtns, easingBtns };
    });

    function refresh() {
        const playing = app.nowPlaying();
        for (const { layer, setName, rateBtns, easingBtns } of rows) {
            const { label, rate, easing } = playing[layer];
            setName(label);
            highlight(rateBtns, i => RATES[i] === rate, rate === null);
            highlight(easingBtns, i => sameCurve(EASING_MODES[i].curve, easing), easing === null);
        }
    }

    refresh();
    return refresh;
}
