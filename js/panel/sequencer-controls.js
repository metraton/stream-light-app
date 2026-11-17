// --- Sequencer Controls (visual panel + color selection, pattern, movement, glow, moods) ---
import { CONFIG } from '../config.js';
import { ColorSequencer } from '../color-sequencer.js';
import { GLOW_QUICK } from '../glow-map.js';
import { MOODS, MOOD_QUICK } from '../mood-map.js';
import { BPM_MIN, BPM_MAX } from '../tempo.js';
import { colorHex } from './color-controls.js';

// Every button group uses the same two-line "KEY over WORD" layout via keyLabel(),
// and every row of the 6-key grid starts with None.
const COLOR_INDICES = [-1, 0, 1, 2, 3, 4, 99];
const COLOR_KEYS = ['|', '1', '2', '3', '4', '5', '6'];
const COLOR_WORDS = ['Empty', 'Yellow', 'Blue', 'Red', 'Green', 'Purple', 'Todos al azar'];
const EMPTY_HEX = '#444';
const ALL_COLORS_HEX = '#888';
const COLOR_EMOJIS = ['⬛', '🟨', '🟦', '🟥', '🟩', '🟪'];

const PATTERNS = ['none', 'chase', 'carousel', 'mirror', 'fill', 'sparkle'];
const PATTERN_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y'];
const PATTERN_WORDS = ['None', 'Chase', 'Carousel', 'Mirror', 'Fill', 'Sparkle'];

const MOVEMENTS = ['none', 'wave', 'expand', 'broken', 'shake', 'equalizer', 'zoomPulse'];
const MOVEMENT_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
const MOVEMENT_WORDS = ['None', 'Wave', 'Expand', 'Broken', 'Shake', 'Equalizer', 'Zoom'];

/** The hex of a color slot (0-4) as CONFIG.colors holds it now. */
function slotHex(slot) {
    return colorHex(CONFIG.colorOrder[slot]);
}

/** The swatch of color button `i`, read from CONFIG.colors so it follows hex edits. */
function colorButtonHex(i) {
    const idx = COLOR_INDICES[i];
    if (idx === -1) return EMPTY_HEX;
    if (idx === 99) return ALL_COLORS_HEX;
    return slotHex(idx);
}

/** Build the uniform two-line button content: key glyph on top, word below. */
function keyLabel(btn, key, word) {
    btn.innerHTML = '';
    btn.classList.add('key-btn');
    btn.title = word;
    const k = document.createElement('span');
    k.className = 'btn-key';
    k.textContent = key;
    const w = document.createElement('span');
    w.className = 'btn-word';
    w.textContent = word;
    btn.appendChild(k);
    btn.appendChild(w);
}

/** A heading and one row of equal-width key buttons under it; returns the row. */
function keyRow(sectionEl, title) {
    const header = document.createElement('div');
    header.className = 'subhead';
    header.textContent = title;
    const row = document.createElement('div');
    row.className = 'btn-grid';
    sectionEl.append(header, row);
    return row;
}

/**
 * Creates sequencer controls and returns a refresh callback for live updates.
 * @returns {Function} refresh callback
 */
export function createSequencerControls(sectionEl, app) {
    const seq = app.sequencer;

    // === Layer Tags ===
    const tagsRow = document.createElement('div');
    tagsRow.className = 'layer-tags';

    const tagColors = createTag('Colors: --');
    const tagPattern = createTag('Pattern: --');
    const tagMovement = createTag('Move: --');
    const tagGlow = createTag('Glow: --');

    tagsRow.append(tagColors, tagPattern, tagMovement, tagGlow);
    sectionEl.appendChild(tagsRow);

    // === Mini Stage ===
    const miniStage = document.createElement('div');
    miniStage.className = 'mini-stage';
    const miniCols = [];
    for (let i = 0; i < 5; i++) {
        const col = document.createElement('div');
        col.className = 'mini-col';
        miniCols.push(col);
        miniStage.appendChild(col);
    }
    sectionEl.appendChild(miniStage);

    // === Step Dots ===
    const stepDots = document.createElement('div');
    stepDots.className = 'step-dots';
    sectionEl.appendChild(stepDots);

    // === Pattern Preview ===
    const patternPreview = document.createElement('div');
    patternPreview.className = 'pattern-preview';
    patternPreview.textContent = 'Select colors and a pattern';
    sectionEl.appendChild(patternPreview);

    // === Colors ===
    const colorRow = keyRow(sectionEl, 'Colors (| 1-6)');

    const colorBtns = [];
    for (let i = 0; i < COLOR_KEYS.length; i++) {
        const btn = document.createElement('button');
        btn.className = 'swatch-btn';
        keyLabel(btn, COLOR_KEYS[i], COLOR_WORDS[i]);

        btn.addEventListener('click', () => {
            const idx = COLOR_INDICES[i];
            if (idx === 99) {
                app.shuffleColors();
            } else {
                app.toggleColor(idx);
            }
            refreshAll();
            app.refreshPanel();
        });

        colorBtns.push(btn);
        colorRow.appendChild(btn);
    }

    // Cue (= Backspace): stage a new combo while the live one keeps playing; Play commits it.
    const cueRow = document.createElement('div');
    cueRow.className = 'btn-grid';
    const cueBtn = document.createElement('button');
    cueBtn.textContent = '⧉ Cue (Backspace)';
    cueBtn.addEventListener('click', () => {
        app.cue();
        refreshAll();
    });
    cueRow.appendChild(cueBtn);
    sectionEl.appendChild(cueRow);

    // === Pattern Selection ===
    const patRow = keyRow(sectionEl, 'Pattern (Q W E R T Y)');

    const patBtns = [];
    for (let i = 0; i < PATTERNS.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, PATTERN_KEYS[i], PATTERN_WORDS[i]);
        btn.addEventListener('click', () => {
            app.setPattern(PATTERNS[i]);
            refreshAll();
            app.refreshPanel();
        });
        patBtns.push(btn);
        patRow.appendChild(btn);
    }

    // === Movement Selection ===
    const movRow = keyRow(sectionEl, `Movement (${MOVEMENT_KEYS.join(' ')})`);

    const movBtns = [];
    for (let i = 0; i < MOVEMENTS.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, MOVEMENT_KEYS[i], MOVEMENT_WORDS[i]);
        btn.addEventListener('click', () => {
            const movement = MOVEMENTS[i];
            if (movement === 'none') {
                app.stopEffect();
            } else {
                app.playMovement(movement);
            }
            refreshAll();
            app.refreshPanel();
        });
        movBtns.push(btn);
        movRow.appendChild(btn);
    }

    // === Glow Mode ===
    const glowRow = keyRow(sectionEl, 'Glow (Z X C V B N)');

    const glowBtns = [];
    for (const { key, mode, label } of GLOW_QUICK) {
        const btn = document.createElement('button');
        keyLabel(btn, key.toUpperCase(), label);
        btn.addEventListener('click', () => {
            app.setGlowMode(mode);
            refreshAll();
            app.refreshPanel();
        });
        glowBtns.push(btn);
        glowRow.appendChild(btn);
    }

    // === Moods ===
    const moodRow = keyRow(sectionEl, 'Moods (Shift+Z X C V B N, < None)');

    const moodBtns = [];
    for (const { key, mood, label } of MOOD_QUICK) {
        const btn = document.createElement('button');
        keyLabel(btn, key.toUpperCase(), label);
        btn.addEventListener('click', () => {
            app.applyMood(MOODS[mood], mood);
            refreshAll();
            app.refreshPanel();
        });
        moodBtns.push(btn);
        moodRow.appendChild(btn);
    }
    const noneBtn = document.createElement('button');
    keyLabel(noneBtn, '<', 'None');
    noneBtn.addEventListener('click', () => {
        app.clearMood();
        refreshAll();
        app.refreshPanel();
    });
    moodRow.appendChild(noneBtn);

    // === BPM ===
    const bpmRow = document.createElement('div');
    bpmRow.className = 'slider-row bpm-row';

    const bpmLabel = document.createElement('label');
    bpmLabel.textContent = 'BPM';

    const bpmSlider = document.createElement('input');
    const bpmBox = document.createElement('input');
    bpmSlider.type = 'range';
    bpmBox.type = 'number';
    bpmBox.className = 'slider-value bpm-input';
    for (const input of [bpmSlider, bpmBox]) {
        input.min = String(BPM_MIN);
        input.max = String(BPM_MAX);
        input.step = '1';
        input.value = seq.bpm;
    }

    bpmSlider.addEventListener('input', () => {
        seq.setBPM(Number(bpmSlider.value));
        bpmBox.value = seq.bpm;
    });
    bpmBox.addEventListener('change', () => {
        const typed = Number(bpmBox.value);
        if (bpmBox.value !== '' && Number.isFinite(typed)) seq.setBPM(typed);
        bpmBox.value = seq.bpm;
        bpmSlider.value = seq.bpm;
    });

    bpmRow.appendChild(bpmLabel);
    bpmRow.appendChild(bpmSlider);
    bpmRow.appendChild(bpmBox);
    sectionEl.appendChild(bpmRow);

    // === Play/Pause (= Space): commits a cue, else toggles; the label shows the current state ===
    const transportRow = document.createElement('div');
    transportRow.className = 'btn-grid';

    const playBtn = document.createElement('button');
    playBtn.addEventListener('click', () => {
        if (seq.staging) {
            app.commitCue();
        } else {
            seq.togglePlay();
        }
        refreshAll();
        app.refreshPanel();
    });

    transportRow.appendChild(playBtn);
    sectionEl.appendChild(transportRow);

    // === Refresh functions ===

    // Each button bank, with the predicate that decides "active", read from the
    // single sources of truth (seq + app) rather than a local mirror.
    function activeStateGroups() {
        return [
            { btns: patBtns,  isActive: i => shownPattern() === PATTERNS[i] },
            { btns: movBtns,  isActive: i => app.currentMovement === MOVEMENTS[i] },
            { btns: glowBtns, isActive: i => app.currentGlowMode === GLOW_QUICK[i].mode },
            { btns: moodBtns, isActive: i => app.currentMood === MOOD_QUICK[i].mood },
        ];
    }

    function refreshActiveStates() {
        for (const { btns, isActive } of activeStateGroups()) {
            for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('is-active', isActive(i));
        }
    }

    // The active pattern's button reads "Word ⇄" while its Shift variant plays.
    function updatePatternLabels() {
        const variant = seq.staging ? seq.pendingVariant : seq.variant;
        for (let i = 0; i < patBtns.length; i++) {
            const word = variant && shownPattern() === PATTERNS[i] ? `${PATTERN_WORDS[i]} ⇄` : PATTERN_WORDS[i];
            keyLabel(patBtns[i], PATTERN_KEYS[i], word);
        }
    }

    function refreshAll() {
        updateColorBtns();
        refreshActiveStates();
        updatePatternLabels();
        updateTags();
        updateMiniStage();
        updateStepDots();
        updatePatternPreview();
        if (document.activeElement !== bpmBox) bpmBox.value = seq.bpm;
        bpmSlider.value = seq.bpm;
        updatePlayBtn();
    }

    function updatePlayBtn() {
        playBtn.textContent = seq.isPlaying ? '▶ Playing' : '❚❚ Pausa';
        playBtn.title = seq.isPlaying ? 'Click (or Space) to pause' : 'Click (or Space) to play';
        playBtn.classList.toggle('is-active', seq.isPlaying);
    }

    // While staging (DJ cue), the panel reflects the PENDING combo being built;
    // otherwise the LIVE selection. (The screen behind keeps rotating LIVE.)
    function shownColors() { return seq.staging ? seq.pendingColors : seq.selectedColors; }
    function shownPattern() { return seq.staging ? seq.pendingPattern : seq.pattern; }

    function updateColorBtns() {
        const colors = shownColors();
        for (let i = 0; i < colorBtns.length; i++) {
            const idx = COLOR_INDICES[i];
            let selected;
            if (idx === 99) {
                selected = colors.length === 5 && [0,1,2,3,4].every(c => colors.includes(c));
            } else {
                selected = colors.includes(idx);
            }
            colorBtns[i].style.setProperty('--swatch', colorButtonHex(i));
            colorBtns[i].classList.toggle('is-active', selected);
        }
    }

    function updateTags() {
        const colorNames = seq.selectedColors.map(c => ColorSequencer.colorName(c)?.substring(0, 3) || '?').join(', ');
        tagColors.textContent = `Colors: ${colorNames || '--'}`;
        tagColors.classList.toggle('on', seq.selectedColors.length > 0);

        tagPattern.textContent = `Pattern: ${seq.pattern || '--'}`;
        tagPattern.classList.toggle('on', !!seq.pattern);

        tagMovement.textContent = `Move: ${app.currentMovement}`;
        tagMovement.classList.toggle('on', app.currentMovement !== 'none');

        tagGlow.textContent = `Glow: ${app.currentGlowMode}`;
        tagGlow.classList.toggle('on', app.currentGlowMode !== 'none');
    }

    function updateMiniStage() {
        const frame = seq.currentFrame;
        for (let i = 0; i < 5; i++) {
            const mc = miniCols[i];
            const colorIdx = frame[i];
            const lit = colorIdx >= 0 && colorIdx <= 4;
            if (lit) mc.style.setProperty('--swatch', slotHex(colorIdx));
            else mc.style.removeProperty('--swatch');
            mc.classList.toggle('is-lit', lit);
            mc.classList.toggle('is-empty', colorIdx === -1);
            mc.classList.toggle('glow-on', lit && app.currentGlowMode !== 'none');
        }
    }

    function updateStepDots() {
        const total = seq.frames.length;
        const current = seq.currentStep % Math.max(1, total);
        let html = '';
        for (let i = 0; i < total && i < 20; i++) {
            html += `<div class="step-dot${i === current ? ' active' : ''}"></div>`;
        }
        if (total > 20) html += '<div class="step-dot more"></div>';
        stepDots.innerHTML = html;
    }

    const sqEmoji = (c) => c === -1 ? COLOR_EMOJIS[0]
        : (c >= 0 && c <= 4) ? COLOR_EMOJIS[c + 1] : '⬜';

    function updatePatternPreview() {
        // While staging, the preview shows the PENDING combo being cued (one row
        // per pending color). The live rotation keeps playing behind the scenes.
        if (seq.staging) {
            const pend = seq.pendingColors;
            if (pend.length === 0) {
                patternPreview.textContent = 'Cue: elige colores… (Play para activar)';
                return;
            }
            patternPreview.innerHTML = pend.map(c =>
                `<div class="step-line current"><span class="sq">${sqEmoji(c)}</span></div>`
            ).join('');
            return;
        }
        if (seq.frames.length === 0) {
            patternPreview.textContent = 'Select colors and a pattern';
            return;
        }
        const current = seq.currentStep % seq.frames.length;
        patternPreview.innerHTML = seq.frames.map((frame, i) => {
            const squares = frame.map(c => `<span class="sq">${sqEmoji(c)}</span>`).join('');
            return `<div class="step-line${i === current ? ' current' : ''}">${squares}</div>`;
        }).join('');
    }

    refreshAll();

    // Called from panel.refreshSequencerUI on every external state change.
    return refreshAll;
}

function createTag(text) {
    const tag = document.createElement('span');
    tag.className = 'layer-tag';
    tag.textContent = text;
    return tag;
}
