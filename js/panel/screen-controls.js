// --- Pantalla section: whole-screen effects over every column and glow at once ---
// Several can be on together; they run in the fixed order of their buttons,
// not the order they were turned on. Each effect that is on shows its params.
import { CONFIG } from '../config.js';
import { SCREEN_EFFECTS, screenEffectById } from '../screen-effects.js';
import { hasScreenEffect, toggleScreenEffect, setScreenParam, resetScreenStack } from '../screen-stack.js';
import { createParamControls } from './effect-params.js';

/** Builds the Pantalla section; returns its refresh callback. */
export function createScreenControls(sectionEl, app) {
    const list = CONFIG.screenEffects;
    const applyScreen = () => app.columnManager.screenLayer.apply();

    const toggleRow = document.createElement('div');
    toggleRow.className = 'effect-buttons';
    sectionEl.appendChild(toggleRow);
    const toggles = SCREEN_EFFECTS.map(({ id, label }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.title = 'Activa o quita el efecto sobre toda la pantalla';
        btn.addEventListener('click', () => {
            toggleScreenEffect(list, id);
            changed();
        });
        toggleRow.appendChild(btn);
        return { btn, id };
    });

    const paramBox = document.createElement('div');
    sectionEl.appendChild(paramBox);

    const resetRow = document.createElement('div');
    resetRow.className = 'preset-row';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset pantalla';
    resetBtn.title = 'Quita todos los efectos de pantalla';
    resetBtn.style.flex = '1';
    resetBtn.addEventListener('click', () => {
        resetScreenStack(list);
        changed();
    });
    resetRow.appendChild(resetBtn);
    sectionEl.appendChild(resetRow);

    function changed() {
        applyScreen();
        refresh();
    }

    function refresh() {
        for (const { btn, id } of toggles) btn.classList.toggle('active', hasScreenEffect(list, id));
        paramBox.innerHTML = '';
        for (const { id, params } of list) {
            createParamControls(paramBox, screenEffectById(id), params, (key, value) => {
                setScreenParam(list, id, key, value);
                applyScreen();
            }, refresh);
        }
    }

    refresh();
    return refresh;
}
