// --- Color Controls (Color Hex): one picker per color, then the color sets ---
import { CONFIG } from '../config.js';
import {
    BUILTIN_SETS, NAME_MAX_LENGTH, hexFromInt,
    encodeShareCode, decodeShareCode, loadUserSets, saveUserSet, deleteUserSet,
} from '../color-sets.js';

/** The CSS hex of color `name` (a CONFIG.colorOrder entry) as it is now. */
export function colorHex(name) {
    return hexFromInt(CONFIG.colors[name]);
}

function intFromHex(hex) {
    return parseInt(hex.slice(1), 16);
}

/** The five current colors as '#rrggbb', in slot order. */
function currentColors() {
    return CONFIG.colorOrder.map(colorHex);
}

/** Write five '#rrggbb' colors into CONFIG.colors, slot by slot. */
function writeColors(colors) {
    CONFIG.colorOrder.forEach((name, slot) => { CONFIG.colors[name] = intFromHex(colors[slot]); });
}

/**
 * Builds one picker per color and the "Sets de colores" control.
 * @param {Function} onColorsChange called after the colors change, so every panel swatch redraws.
 * @returns {Function} refresh: shows CONFIG.colors in the pickers and marks the matching set.
 */
export function createColorControls(sectionEl, app, onColorsChange) {
    const rows = CONFIG.colorOrder.map(name => {
        const row = document.createElement('div');
        row.className = 'color-row';

        const label = document.createElement('label');
        label.textContent = name;

        const picker = document.createElement('input');
        picker.type = 'color';

        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'hex-value';

        picker.addEventListener('input', () => {
            CONFIG.colors[name] = intFromHex(picker.value);
            app.reapplyColors();
            onColorsChange();
        });

        row.appendChild(label);
        row.appendChild(picker);
        row.appendChild(hexDisplay);
        sectionEl.appendChild(row);
        return { name, picker, hexDisplay };
    });

    const refreshSets = createSetControls(sectionEl, colors => {
        writeColors(colors);
        app.reapplyColors();
        onColorsChange();
    });

    function refresh() {
        for (const { name, picker, hexDisplay } of rows) {
            picker.value = colorHex(name);
            hexDisplay.textContent = picker.value;
        }
        refreshSets();
    }

    refresh();
    return refresh;
}

/**
 * Builds the set buttons, the save row and the share-code row.
 * @param {Function} applyColors takes five '#rrggbb' and makes them live.
 * @returns {Function} refresh: marks the set equal to the current colors.
 */
function createSetControls(sectionEl, applyColors) {
    const header = document.createElement('div');
    header.className = 'effect-name';
    header.textContent = 'Sets de colores';
    header.style.marginTop = '10px';

    const list = document.createElement('div');
    list.className = 'color-sets';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Nombre del set...';
    nameInput.maxLength = NAME_MAX_LENGTH;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Guardar';
    const saveRow = document.createElement('div');
    saveRow.className = 'preset-row';
    saveRow.append(nameInput, saveBtn);

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.placeholder = 'Código SLA1...';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copiar';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Cargar';
    const shareRow = document.createElement('div');
    shareRow.className = 'preset-row';
    shareRow.append(codeInput, copyBtn, loadBtn);

    const message = document.createElement('div');
    message.className = 'color-set-message';

    sectionEl.append(header, list, saveRow, shareRow, message);

    let entries = [];

    function say(text, isError = false) {
        message.textContent = text;
        message.classList.toggle('error', isError);
    }

    function matchingSet() {
        const now = currentColors().join();
        return entries.find(({ set }) => set.colors.join() === now)?.set ?? null;
    }

    function setButton(set, removable) {
        const btn = document.createElement('button');
        btn.className = 'color-set';
        btn.title = set.name;
        const strip = document.createElement('span');
        strip.className = 'color-set-strip';
        for (const hex of set.colors) {
            const swatch = document.createElement('span');
            swatch.style.background = hex;
            strip.appendChild(swatch);
        }
        const label = document.createElement('span');
        label.textContent = set.name;
        btn.append(strip, label);
        btn.addEventListener('click', () => {
            applyColors(set.colors);
            say(`Set "${set.name}" aplicado.`);
        });
        if (removable) {
            const del = document.createElement('span');
            del.className = 'color-set-delete';
            del.textContent = '×';
            del.title = 'Borrar set';
            del.addEventListener('click', e => {
                e.stopPropagation();
                deleteUserSet(set.name);
                renderList();
                say(`Set "${set.name}" borrado.`);
            });
            btn.appendChild(del);
        }
        return { set, btn };
    }

    function renderList() {
        entries = [
            ...BUILTIN_SETS.map(set => setButton(set, false)),
            ...loadUserSets().map(set => setButton(set, true)),
        ];
        list.replaceChildren(...entries.map(({ btn }) => btn));
        refresh();
    }

    function refresh() {
        const active = matchingSet();
        for (const { set, btn } of entries) btn.classList.toggle('active', set === active);
    }

    saveBtn.addEventListener('click', () => {
        try {
            const set = saveUserSet(nameInput.value, currentColors());
            nameInput.value = '';
            renderList();
            say(`Set "${set.name}" guardado.`);
        } catch (err) {
            say(err.message, true);
        }
    });

    copyBtn.addEventListener('click', () => {
        const name = matchingSet()?.name || nameInput.value.trim() || 'Mi set';
        try {
            codeInput.value = encodeShareCode({ name, colors: currentColors() });
        } catch (err) {
            say(err.message, true);
            return;
        }
        codeInput.select();
        navigator.clipboard.writeText(codeInput.value).then(
            () => say(`Código de "${name}" copiado.`),
            () => say('No se pudo copiar: copia el código del campo.', true),
        );
    });

    loadBtn.addEventListener('click', () => {
        try {
            const set = decodeShareCode(codeInput.value);
            applyColors(set.colors);
            nameInput.value = set.name;
            say(`Set "${set.name}" cargado. Guárdalo para conservarlo.`);
        } catch (err) {
            say(err.message, true);
        }
    });

    renderList();
    return refresh;
}
