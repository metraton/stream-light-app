// --- One effect's param controls, shared by the Color effects and Pantalla ---
import { createSlider } from './slider.js';

/** A group titled with the effect: a slider per numeric param and a button row per choice;
 *  an edit calls write(key, value), and a choice then rebuild() so the pick lights up. */
export function createParamControls(parent, effect, params, write, rebuild) {
    const group = document.createElement('div');
    group.className = 'param-group';
    const title = document.createElement('div');
    title.className = 'subhead';
    title.textContent = effect.label;
    group.appendChild(title);
    parent.appendChild(group);

    for (const param of effect.params) {
        if (param.options) {
            const row = document.createElement('div');
            row.className = 'btn-grid';
            row.title = `${effect.label} · ${param.label}`;
            for (const option of param.options) {
                const btn = document.createElement('button');
                btn.textContent = `${param.label}: ${option.label}`;
                btn.classList.toggle('is-active', params[param.key] === option.value);
                btn.addEventListener('click', () => {
                    write(param.key, option.value);
                    rebuild();
                });
                row.appendChild(btn);
            }
            group.appendChild(row);
        } else {
            createSlider(group, {
                label: param.label, min: param.min, max: param.max, decimals: param.decimals,
                defaultValue: effect.defaults[param.key],
                value: params[param.key],
                onChange: v => write(param.key, v),
            });
        }
    }
}
