// --- Sequencer Controls (visual panel + color selection, pattern, movement, glow, moods) ---
import { CONFIG } from '../config.js';
import { ColorSequencer } from '../color-sequencer.js';
import { GLOW_QUICK } from '../glow-map.js';
import { MOODS, MOOD_QUICK } from '../mood-map.js';
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

const MOVEMENTS = ['none', 'wave', 'expand', 'broken', 'shake', 'equalizer'];
const MOVEMENT_KEYS = ['A', 'S', 'D', 'F', 'G', 'H'];
const MOVEMENT_WORDS = ['None', 'Wave', 'Expand', 'Broken', 'Shake', 'Equalizer'];

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
    const k = document.createElement('span');
    k.className = 'btn-key';
    k.textContent = key;
    const w = document.createElement('span');
    w.className = 'btn-word';
    w.textContent = word;
    btn.appendChild(k);
    btn.appendChild(w);
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
    const colorHeader = document.createElement('div');
    colorHeader.className = 'effect-name';
    colorHeader.textContent = 'Colors (| 1-6)';
    sectionEl.appendChild(colorHeader);

    const colorRow = document.createElement('div');
    colorRow.className = 'effect-buttons';
    colorRow.style.flexWrap = 'wrap';
    colorRow.style.gap = '4px';

    const colorBtns = [];
    for (let i = 0; i < COLOR_KEYS.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, COLOR_KEYS[i], COLOR_WORDS[i]);

        btn.addEventListener('click', () => {
            const idx = COLOR_INDICES[i];
            if (idx === 99) {
                seq.selectAllShuffled();
            } else {
                seq.toggleColor(idx);
            }
            refreshAll();
            app.updateHUD();
        });

        colorBtns.push(btn);
        colorRow.appendChild(btn);
    }
    sectionEl.appendChild(colorRow);

    // Cue (= Backspace): stage a new combo while the live one keeps playing; Play commits it.
    const cueBtn = document.createElement('button');
    cueBtn.textContent = '⧉ Cue (Backspace)';
    cueBtn.style.marginTop = '4px';
    cueBtn.style.width = '100%';
    cueBtn.addEventListener('click', () => {
        app.cue();
        refreshAll();
    });
    sectionEl.appendChild(cueBtn);

    // === Pattern Selection ===
    const patHeader = document.createElement('div');
    patHeader.className = 'effect-name';
    patHeader.textContent = 'Pattern (Q W E R T Y)';
    patHeader.style.marginTop = '10px';
    sectionEl.appendChild(patHeader);

    const patRow = document.createElement('div');
    patRow.className = 'effect-buttons';
    patRow.style.flexWrap = 'wrap';
    patRow.style.gap = '4px';

    const patBtns = [];
    for (let i = 0; i < PATTERNS.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, PATTERN_KEYS[i], PATTERN_WORDS[i]);
        btn.addEventListener('click', () => {
            seq.setPattern(PATTERNS[i]);
            refreshAll();
            app.updateHUD();
        });
        patBtns.push(btn);
        patRow.appendChild(btn);
    }
    sectionEl.appendChild(patRow);

    // === Movement Selection ===
    const movHeader = document.createElement('div');
    movHeader.className = 'effect-name';
    movHeader.textContent = 'Movement (A S D F G H)';
    movHeader.style.marginTop = '10px';
    sectionEl.appendChild(movHeader);

    const movRow = document.createElement('div');
    movRow.className = 'effect-buttons';
    movRow.style.flexWrap = 'wrap';
    movRow.style.gap = '4px';

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
            app.updateHUD();
        });
        movBtns.push(btn);
        movRow.appendChild(btn);
    }
    sectionEl.appendChild(movRow);

    // === Glow Mode ===
    const glowHeader = document.createElement('div');
    glowHeader.className = 'effect-name';
    glowHeader.textContent = 'Glow (Z X C V B N)';
    glowHeader.style.marginTop = '10px';
    sectionEl.appendChild(glowHeader);

    const glowRow = document.createElement('div');
    glowRow.className = 'effect-buttons';
    glowRow.style.flexWrap = 'wrap';
    glowRow.style.gap = '4px';

    const glowBtns = [];
    for (const { key, mode, label } of GLOW_QUICK) {
        const btn = document.createElement('button');
        keyLabel(btn, key.toUpperCase(), label);
        btn.addEventListener('click', () => {
            app.setGlowMode(mode);
            refreshAll();
            app.updateHUD();
        });
        glowBtns.push(btn);
        glowRow.appendChild(btn);
    }
    sectionEl.appendChild(glowRow);

    // === Moods ===
    const moodHeader = document.createElement('div');
    moodHeader.className = 'effect-name';
    moodHeader.textContent = 'Moods (Shift+Z X C V B N)';
    moodHeader.style.marginTop = '10px';
    sectionEl.appendChild(moodHeader);

    const moodRow = document.createElement('div');
    moodRow.className = 'effect-buttons';
    moodRow.style.flexWrap = 'wrap';
    moodRow.style.gap = '4px';

    const moodBtns = [];
    for (const { key, mood, label } of MOOD_QUICK) {
        const btn = document.createElement('button');
        keyLabel(btn, key.toUpperCase(), label);
        btn.addEventListener('click', () => {
            if (mood === null) {
                app.clearMood();
            } else {
                app.applyMood(MOODS[mood], mood);
            }
            refreshAll();
            app.updateHUD();
        });
        moodBtns.push(btn);
        moodRow.appendChild(btn);
    }
    sectionEl.appendChild(moodRow);

    // === BPM ===
    const bpmRow = document.createElement('div');
    bpmRow.className = 'layout-row';
    bpmRow.style.marginTop = '10px';

    const bpmLabel = document.createElement('label');
    bpmLabel.textContent = 'BPM';

    const bpmSlider = document.createElement('input');
    bpmSlider.type = 'range';
    bpmSlider.min = '40';
    bpmSlider.max = '300';
    bpmSlider.step = '5';
    bpmSlider.value = seq.bpm;

    const bpmVal = document.createElement('span');
    bpmVal.className = 'range-value';
    bpmVal.textContent = seq.bpm;

    bpmSlider.addEventListener('input', () => {
        seq.setBPM(parseInt(bpmSlider.value));
        bpmVal.textContent = bpmSlider.value;
    });

    bpmRow.appendChild(bpmLabel);
    bpmRow.appendChild(bpmSlider);
    bpmRow.appendChild(bpmVal);
    sectionEl.appendChild(bpmRow);

    // === Play/Stop ===
    const transportRow = document.createElement('div');
    transportRow.className = 'effect-buttons';
    transportRow.style.marginTop = '6px';

    const playBtn = document.createElement('button');
    playBtn.textContent = '▶ Play';
    playBtn.addEventListener('click', () => {
        if (seq.staging) {
            app.commitCue();
        } else {
            seq.play();
        }
        refreshAll();
        app.updateHUD();
    });

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '■ Stop';
    stopBtn.addEventListener('click', () => {
        seq.stop();
        app.updateHUD();
    });

    transportRow.appendChild(playBtn);
    transportRow.appendChild(stopBtn);
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
            for (let i = 0; i < btns.length; i++) {
                const on = isActive(i);
                btns[i].style.background = on ? '#FFD700' : '#333';
                btns[i].style.color = on ? '#000' : '#aaa';
            }
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
        bpmVal.textContent = seq.bpm;
        bpmSlider.value = seq.bpm;
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
            const hex = colorButtonHex(i);
            colorBtns[i].style.border = `2px solid ${hex}`;
            colorBtns[i].style.background = selected ? hex : '#222';
            colorBtns[i].style.color = selected ? '#000' : '#aaa';
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
            if (colorIdx === -1) {
                mc.style.backgroundColor = '#555';
                mc.style.setProperty('--mini-glow', '#fff');
                mc.classList.add('active');
                mc.classList.remove('glow-on');
            } else if (colorIdx >= 0 && colorIdx <= 4) {
                const hex = slotHex(colorIdx);
                mc.style.backgroundColor = hex;
                mc.style.setProperty('--mini-glow', hex);
                mc.classList.add('active');
                mc.classList.toggle('glow-on', app.currentGlowMode !== 'none');
            } else {
                mc.style.backgroundColor = '#222';
                mc.classList.remove('active', 'glow-on');
            }
        }
    }

    function updateStepDots() {
        const total = seq.frames.length;
        const current = seq.currentStep % Math.max(1, total);
        let html = '';
        for (let i = 0; i < total && i < 20; i++) {
            html += `<div class="step-dot${i === current ? ' active' : ''}"></div>`;
        }
        if (total > 20) html += `<div class="step-dot" style="background:#555">+</div>`;
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
