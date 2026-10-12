// --- Movimiento section: the movement playing now ---
// Rate and easing for it live in "Sonando ahora" (layer-controls.js); this
// section names it and stops it. Nothing here writes to EFFECTS.
import { EFFECTS } from '../effects.js';

/** Builds the section; returns its refresh callback. */
export function createEffectControls(sectionEl, app) {
    const row = document.createElement('div');
    row.className = 'effect-row';
    const label = document.createElement('label');
    label.textContent = 'Movimiento';
    const name = document.createElement('span');
    name.className = 'range-value';
    row.append(label, name);
    sectionEl.appendChild(row);

    const buttons = document.createElement('div');
    buttons.className = 'effect-buttons';
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => app.stopEffect());
    buttons.appendChild(stopBtn);
    sectionEl.appendChild(buttons);

    function refresh() {
        name.textContent = EFFECTS[app.currentMovement]?.label ?? 'None';
    }

    refresh();
    return refresh;
}
