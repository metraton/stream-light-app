// --- Texto section: the key-9 phrase, its saved phrases and its look ---
// Edits CONFIG.text (saved in presets) and the saved-phrase list (its own
// localStorage key, overlay-text.js PHRASES_KEY); visibility stays on the overlay.
import { CONFIG, DEFAULTS } from '../config.js';
import {
    MAX_PHRASE_LENGTH, TEXT_SIZE, normalizePhrase, addPhrase, removePhrase, loadPhrases, savePhrases,
} from '../overlay-text.js';
import { createSlider } from './slider.js';
import { buttonRow } from './layer-controls.js';
import { markChoice } from './effect-controls.js';

const COLOR_MODES = [
    { value: 'neon',   label: 'Neón' },
    { value: 'column', label: 'Columna' },
    { value: 'white',  label: 'Blanco' },
    { value: 'custom', label: 'Custom' },
];
const POSITIONS = [
    { value: 'center', label: 'Centro' },
    { value: 'top',    label: 'Arriba' },
    { value: 'bottom', label: 'Abajo' },
];
const BEAT_MODES = [
    { value: 'fixed',   label: 'Fijo' },
    { value: 'pulse',   label: 'Pulso al golpe' },
    { value: 'flicker', label: 'Parpadeo neón' },
];

/** Builds the Texto section; returns its refresh callback. */
export function createTextControls(sectionEl, app) {
    const text = CONFIG.text;
    const redraw = () => app.overlay.refresh();
    let phrases = loadPhrases();

    const [showBtn] = buttonRow(sectionEl, [''], () => app.toggleOverlay());

    const phraseRow = document.createElement('div');
    phraseRow.className = 'preset-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_PHRASE_LENGTH;
    input.placeholder = 'Frase...';
    input.value = text.phrase;
    input.addEventListener('input', () => {
        const phrase = normalizePhrase(input.value);
        if (!phrase) return;
        text.phrase = phrase;
        redraw();
    });
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Guardar';
    saveBtn.title = 'Guarda la frase como botón';
    saveBtn.addEventListener('click', () => {
        phrases = addPhrase(phrases, input.value);
        savePhrases(phrases);
        renderPhrases();
    });
    phraseRow.append(input, saveBtn);
    sectionEl.appendChild(phraseRow);

    const phraseList = document.createElement('div');
    phraseList.className = 'effect-buttons';
    phraseList.style.flexWrap = 'wrap';
    phraseList.style.gap = '4px';
    sectionEl.appendChild(phraseList);

    function renderPhrases() {
        phraseList.replaceChildren();
        for (const phrase of phrases) {
            const pick = document.createElement('button');
            pick.textContent = phrase;
            pick.addEventListener('click', () => {
                text.phrase = phrase;
                input.value = phrase;
                redraw();
                app.overlay.setVisible(true);
                app.refreshPanel();
            });
            const remove = document.createElement('button');
            remove.textContent = '×';
            remove.title = `Borrar "${phrase}"`;
            remove.addEventListener('click', () => {
                phrases = removePhrase(phrases, phrase);
                savePhrases(phrases);
                renderPhrases();
            });
            phraseList.append(pick, remove);
        }
    }

    const colorBtns = buttonRow(sectionEl, COLOR_MODES.map(m => m.label), i => {
        text.colorMode = COLOR_MODES[i].value;
        refresh();
    });
    const customColor = document.createElement('input');
    customColor.type = 'color';
    customColor.title = 'Custom';
    customColor.value = '#' + text.customColor.toString(16).padStart(6, '0');
    customColor.style.width = '30px';
    customColor.addEventListener('input', () => {
        text.customColor = parseInt(customColor.value.slice(1), 16);
    });
    colorBtns[0].parentElement.appendChild(customColor);

    createSlider(sectionEl, {
        label: 'Tamaño', min: TEXT_SIZE.min, max: TEXT_SIZE.max, decimals: 0,
        defaultValue: DEFAULTS.text.size, value: text.size,
        onChange: v => {
            text.size = v;
            redraw();
        },
    });

    const [bandBtn] = buttonRow(sectionEl, ['Banda'], () => {
        text.band = !text.band;
        redraw();
        refresh();
    });
    createSlider(sectionEl, {
        label: 'Opacidad', min: 0, max: 1, decimals: 2,
        defaultValue: DEFAULTS.text.bandOpacity, value: text.bandOpacity,
        onChange: v => {
            text.bandOpacity = v;
            redraw();
        },
    });

    const positionBtns = buttonRow(sectionEl, POSITIONS.map(p => p.label), i => {
        text.position = POSITIONS[i].value;
        redraw();
        refresh();
    });
    const beatBtns = buttonRow(sectionEl, BEAT_MODES.map(m => m.label), i => {
        text.beat = BEAT_MODES[i].value;
        refresh();
    });

    function refresh() {
        showBtn.textContent = app.overlay.visible ? '9 Ocultar' : '9 Mostrar';
        markChoice([showBtn], () => app.overlay.visible);
        markChoice(colorBtns, i => COLOR_MODES[i].value === text.colorMode);
        customColor.style.display = text.colorMode === 'custom' ? '' : 'none';
        markChoice([bandBtn], () => text.band);
        markChoice(positionBtns, i => POSITIONS[i].value === text.position);
        markChoice(beatBtns, i => BEAT_MODES[i].value === text.beat);
    }

    renderPhrases();
    refresh();
    return refresh;
}
