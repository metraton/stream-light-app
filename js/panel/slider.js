// --- Shared slider: one numeric control for every panel section ---
// The track is curved around the default, so the half next to it is fine and
// the ends are coarse. Shift slows a drag or an arrow key tenfold, a double
// click returns to the default, the number beside it can be typed, and every
// change glides to its target instead of jumping.

const TRACK_STEPS = 1000;
const FINE_FACTOR = 0.1;
// Time constant of the glide toward a new value; about 3x this to settle.
const GLIDE_MS = 90;

/**
 * Builds a labelled slider row in `parent`.
 * options: { label, min, max, defaultValue, value = defaultValue, decimals = 2, onChange }
 * onChange(value) runs for every gliding step whose value, rounded to
 * `decimals`, differs from the last one sent.
 * Returns { show(value), setDisabled(disabled) }: show() moves the control to a
 * value the app already holds, without calling onChange.
 */
export function createSlider(parent, { label, min, max, defaultValue, value = defaultValue, decimals = 2, onChange }) {
    const low = Math.min(min, defaultValue);
    const high = Math.max(max, defaultValue);
    const round = v => Number(v.toFixed(decimals));
    const clamp = v => Math.min(high, Math.max(low, v));

    // Track position p in [-1, 1], 0 at the default; the value grows with p squared.
    const valueAt = p => {
        const span = p >= 0 ? high - defaultValue : defaultValue - low;
        return defaultValue + Math.sign(p) * span * p * p;
    };
    const positionOf = v => {
        const span = v >= defaultValue ? high - defaultValue : defaultValue - low;
        return span === 0 ? 0 : Math.sign(v - defaultValue) * Math.sqrt(Math.abs(v - defaultValue) / span);
    };

    const row = document.createElement('div');
    row.className = 'layout-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.title = 'Shift: ajuste fino · doble clic: valor por defecto';
    const track = document.createElement('input');
    track.type = 'range';
    track.min = -TRACK_STEPS;
    track.max = TRACK_STEPS;
    track.step = 1;
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'range-value';
    number.min = low;
    number.max = high;
    number.step = 10 ** -decimals;
    number.style.width = '56px';
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

    function step(now, lastNow) {
        current += (target - current) * (1 - Math.exp(-(now - lastNow) / GLIDE_MS));
        if (Math.abs(target - current) < (high - low) * 1e-4) current = target;
        if (round(current) !== sent) {
            sent = round(current);
            onChange(sent);
        }
        glide = current === target ? null : requestAnimationFrame(next => step(next, now));
    }

    function glideTo(v) {
        target = clamp(v);
        render();
        if (glide === null) {
            const start = performance.now();
            glide = requestAnimationFrame(now => step(now, start));
        }
    }

    const noteShift = e => { fine = e.shiftKey; };
    track.addEventListener('pointerdown', noteShift);
    track.addEventListener('pointermove', noteShift);
    track.addEventListener('keydown', noteShift);
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
        if (Number.isFinite(typed)) glideTo(typed);
        else render();
    });

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
