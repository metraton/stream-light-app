// --- "Sonando ahora": what each layer plays now, with its rate and easing ---
// Every button acts on the effect that is playing (app.nowPlaying), never on a
// dropdown selection, so a key or button press is followed at once by a rate
// or easing change for that same effect.
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

/** A wrapping row of buttons; clicking one calls onPick with its index. */
export function buttonRow(parent, labels, onPick) {
    const row = document.createElement('div');
    row.className = 'effect-buttons';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px';
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

/** Highlight the button isOn picks; with nothing playing every button is disabled. */
function highlight(btns, isOn, disabled) {
    btns.forEach((btn, i) => {
        const on = !disabled && isOn(i);
        btn.disabled = disabled;
        btn.style.background = on ? '#FFD700' : '#333';
        btn.style.color = on ? '#000' : (disabled ? '#555' : '#aaa');
    });
}

/** Builds the "Sonando ahora" block; returns its refresh callback. */
export function createNowPlaying(parent, app) {
    const header = document.createElement('div');
    header.className = 'effect-name';
    header.textContent = 'Sonando ahora';
    parent.appendChild(header);

    const rows = LAYERS.map(({ layer, title, hasEasing }) => {
        const line = document.createElement('div');
        line.className = 'effect-row';
        const label = document.createElement('label');
        label.textContent = title;
        const name = document.createElement('span');
        name.className = 'range-value';
        line.append(label, name);
        parent.appendChild(line);

        const rateBtns = buttonRow(parent, RATES.map(r => RATE_LABELS.get(r)),
            i => app.setLayerRate(layer, RATES[i]));
        const easingBtns = hasEasing
            ? buttonRow(parent, EASING_MODES.map(m => m.label),
                i => app.setLayerEasing(layer, EASING_MODES[i].curve))
            : [];
        return { layer, name, rateBtns, easingBtns };
    });

    function refresh() {
        const playing = app.nowPlaying();
        for (const { layer, name, rateBtns, easingBtns } of rows) {
            const { label, rate, easing } = playing[layer];
            name.textContent = label;
            highlight(rateBtns, i => RATES[i] === rate, rate === null);
            highlight(easingBtns, i => sameCurve(EASING_MODES[i].curve, easing), easing === null);
        }
    }

    refresh();
    return refresh;
}
