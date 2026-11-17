// --- Shared slider: one numeric control for every panel section (README: the panel) ---

const TRACK_STEPS = 1000;
const FINE_FACTOR = 0.1;
// Time constant of the glide toward a new value; about 3x this to settle.
const GLIDE_MS = 90;
const STEPS_PER_RANGE = 50;
const KEY_DIRECTIONS = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

const roundTo = (value, decimals) => Number(value.toFixed(decimals));

/** The track's value at position p in [-1, 1] and back: 0 is the default, and the value grows with p squared. */
export function curvedScale({ low, high, defaultValue }) {
    return {
        valueAt(p) {
            const span = p >= 0 ? high - defaultValue : defaultValue - low;
            return defaultValue + Math.sign(p) * span * p * p;
        },
        positionOf(v) {
            const span = v >= defaultValue ? high - defaultValue : defaultValue - low;
            return span === 0 ? 0 : Math.sign(v - defaultValue) * Math.sqrt(Math.abs(v - defaultValue) / span);
        },
    };
}

/** About 1/50 of the range, rounded to 1, 2 or 5 times a power of ten, never finer than `decimals`. */
export function defaultStep(low, high, decimals) {
    const raw = (high - low) / STEPS_PER_RANGE;
    const power = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 5, 10].find(m => m * power >= raw - 1e-12) * power;
    return roundTo(Math.max(nice, 10 ** -decimals), decimals);
}

/** The value one step (a tenth of it when `fine`, never finer than `decimals`) away from
 *  `value` in `direction` (+1 or -1), snapped to the step's grid and kept within low-high. */
export function stepValue(value, direction, { low, high, step, decimals }, fine = false) {
    const size = fine ? Math.max(roundTo(step * FINE_FACTOR, decimals), 10 ** -decimals) : step;
    const next = Math.round((value + direction * size) / size) * size;
    return roundTo(Math.min(high, Math.max(low, next)), decimals);
}

/**
 * Builds a labelled slider row in `parent`.
 * options: { label, min, max, defaultValue, value = defaultValue, decimals = 2, step = defaultStep(), onChange }
 * onChange(value) runs for every gliding step whose value, rounded to
 * `decimals`, differs from the last one sent.
 * Returns { show(value), setDisabled(disabled) }: show() moves the control to a
 * value the app already holds, without calling onChange.
 */
export function createSlider(parent, { label, min, max, defaultValue, value = defaultValue, decimals = 2, step, onChange }) {
    const low = Math.min(min, defaultValue);
    const high = Math.max(max, defaultValue);
    const stepping = { low, high, decimals, step: step ?? defaultStep(low, high, decimals) };
    const round = v => roundTo(v, decimals);
    const clamp = v => Math.min(high, Math.max(low, v));
    const { valueAt, positionOf } = curvedScale({ low, high, defaultValue });

    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.title = 'Rueda o flechas: un paso · Shift: ajuste fino · doble clic: valor por defecto';
    const track = document.createElement('input');
    track.type = 'range';
    track.min = -TRACK_STEPS;
    track.max = TRACK_STEPS;
    track.step = 1;
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'slider-value';
    number.min = low;
    number.max = high;
    number.step = stepping.step;
    row.append(lbl, track, number);
    parent.appendChild(row);

    let target = clamp(value);
    let current = target;
    let sent = round(current);
    let fine = false;
    let lastTrack = 0;
    let glide = null;

    function render() {
        lastTrack = Math.round(positionOf(target) * TRACK_STEPS);
        track.value = lastTrack;
        number.value = round(target);
    }

    function advance(now, lastNow) {
        current += (target - current) * (1 - Math.exp(-(now - lastNow) / GLIDE_MS));
        if (Math.abs(target - current) < (high - low) * 1e-4) current = target;
        if (round(current) !== sent) {
            sent = round(current);
            onChange(sent);
        }
        glide = current === target ? null : requestAnimationFrame(next => advance(next, now));
    }

    function glideTo(v) {
        target = clamp(v);
        render();
        if (glide === null) {
            const start = performance.now();
            glide = requestAnimationFrame(now => advance(now, start));
        }
    }

    const stepBy = (direction, shiftKey) => glideTo(stepValue(target, direction, stepping, shiftKey));

    const noteShift = e => { fine = e.shiftKey; };
    track.addEventListener('pointerdown', noteShift);
    track.addEventListener('pointermove', noteShift);
    track.addEventListener('input', () => {
        const raw = Number(track.value);
        const pos = fine ? lastTrack + (raw - lastTrack) * FINE_FACTOR : raw;
        glideTo(valueAt(pos / TRACK_STEPS));
        lastTrack = pos;
        track.value = pos;
    });
    track.addEventListener('dblclick', () => glideTo(defaultValue));
    number.addEventListener('change', () => {
        const typed = Number(number.value);
        if (number.value !== '' && Number.isFinite(typed)) glideTo(typed);
        else render();
    });
    for (const input of [track, number]) {
        input.addEventListener('keydown', e => {
            const direction = KEY_DIRECTIONS[e.key];
            if (!direction || input.disabled) return;
            e.preventDefault();
            stepBy(direction, e.shiftKey);
        });
        // Shift turns a vertical wheel into deltaX in Chrome, so either axis counts.
        input.addEventListener('wheel', e => {
            const delta = e.deltaY || e.deltaX;
            if (!delta || input.disabled) return;
            e.preventDefault();
            stepBy(delta < 0 ? 1 : -1, e.shiftKey);
        }, { passive: false });
    }

    render();

    return {
        show(v) {
            // A refresh mid-glide reports the step just sent; only a value from
            // elsewhere (another movement, a preset) may interrupt the glide.
            if (glide !== null && round(v) === sent) return;
            if (glide !== null) cancelAnimationFrame(glide);
            glide = null;
            target = current = clamp(v);
            sent = round(current);
            render();
        },
        setDisabled(disabled) {
            track.disabled = disabled;
            number.disabled = disabled;
        },
    };
}
