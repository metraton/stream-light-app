// --- One effect's param controls, shared by the Color effects and Pantalla ---
import { createSlider } from './slider.js';

/**
 * Builds in `parent` a slider for each numeric param of `effect` and a button
 * row for each choice, showing `params`. An edit calls write(key, value); a
 * choice then calls rebuild(), which redraws the controls so the pick lights up.
 */
export function createParamControls(parent, effect, params, write, rebuild) {
    for (const param of effect.params) {
        const label = `${effect.label} · ${param.label}`;
        if (param.options) {
            const row = document.createElement('div');
            row.className = 'effect-buttons';
            row.title = label;
            for (const option of param.options) {
                const btn = document.createElement('button');
                btn.textContent = `${param.label}: ${option.label}`;
                btn.classList.toggle('active', params[param.key] === option.value);
                btn.addEventListener('click', () => {
                    write(param.key, option.value);
                    rebuild();
                });
                row.appendChild(btn);
            }
            parent.appendChild(row);
        } else {
            createSlider(parent, {
                label, min: param.min, max: param.max, decimals: param.decimals,
                defaultValue: effect.defaults[param.key],
                value: params[param.key],
                onChange: v => write(param.key, v),
            });
        }
    }
}
