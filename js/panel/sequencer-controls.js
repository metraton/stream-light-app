// --- Sequencer Controls (visual panel + color selection, pattern, movement, glow) ---
import { CONFIG } from '../config.js';
import { ColorSequencer } from '../color-sequencer.js';

// Every button group uses the same two-line "KEY over WORD" layout via keyLabel().
const COLOR_INDICES = [-1, 0, 1, 2, 3, 4, 99];
const COLOR_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
const COLOR_WORDS = ['Empty', 'Yellow', 'Blue', 'Red', 'Green', 'Purple', 'Rainbow'];
const COLOR_HEX = ['#444', '#ffff00', '#55aaff', '#ff0000', '#00ff00', '#ff00ff', 'linear-gradient(90deg,#ff0,#55f,#f00,#0f0,#f0f)'];
const COLOR_EMOJIS = ['\u2B1B', '\uD83D\uDFE8', '\uD83D\uDFE6', '\uD83D\uDFE5', '\uD83D\uDFE9', '\uD83D\uDFEA'];

const PATTERNS = ['solid', 'alternate', 'chase', 'carousel', 'pingpong'];
const PATTERN_KEYS = ['Q', 'W', 'E', 'R', 'T'];
const PATTERN_WORDS = ['Solid', 'Alternate', 'Chase', 'Carousel', 'Ping-Pong'];

const MOVEMENTS = ['none', 'wave', 'expand', 'broken', 'shake', 'equalizer'];
const MOVEMENT_KEYS = ['A', 'S', 'D', 'F', 'G', 'H'];
const MOVEMENT_WORDS = ['None', 'Wave', 'Expand', 'Broken', 'Shake', 'Equalizer'];

const GLOW_MODES = ['none', 'static', 'breathe', 'pulse', 'strobe', 'sweep-right'];
const GLOW_KEYS = ['Z', 'X', 'C', 'V', 'B', '\u25B6'];
const GLOW_WORDS = ['None', 'Static', 'Breathe', 'Pulse', 'Strobe', 'Sweep'];

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

const MOOD_DEFS = [
    { key: null,      hotkey: '—', word: 'None' },   // clears the active mood (no preset)
    { key: 'calm',    hotkey: 'Z', word: 'Calm' },
    { key: 'build',   hotkey: 'X', word: 'Build' },
    { key: 'tension', hotkey: 'C', word: 'Tension' },
    { key: 'peak',    hotkey: 'V', word: 'Peak' },
    { key: 'mystic',  hotkey: 'B', word: 'Mystic' },
];

const MOODS = {
    calm:    { colors: [1],         pattern: 'solid',    movement: 'wave',      glow: 'breathe',   bpm: 80 },
    build:   { colors: [2, 0],      pattern: 'carousel', movement: 'none',      glow: 'cascade',   bpm: 110 },
    tension: { colors: [2],         pattern: 'solid',    movement: 'expand',    glow: 'strobe',    bpm: 150 },
    peak:    { colors: [0,1,2,3,4], pattern: 'carousel', movement: 'wave',      glow: 'alternate', bpm: 180 },
    mystic:  { colors: [4],         pattern: 'solid',    movement: 'equalizer', glow: 'sweep',     bpm: 90 },
};

/**
 * Creates sequencer controls and returns a refresh callback for live updates.
 * @returns {Function} refresh callback
 */
export function createSequencerControls(sectionEl, app) {
    const seq = app.sequencer;
    // Active-state is derived from the single sources of truth (seq + app),
    // not a local mirror — see refreshActiveStates() below.

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

    // === Color Selection ===
    const colorHeader = document.createElement('div');
    colorHeader.className = 'effect-name';
    colorHeader.textContent = 'Color Selection (0-6)';
    sectionEl.appendChild(colorHeader);

    const colorRow = document.createElement('div');
    colorRow.className = 'effect-buttons';
    colorRow.style.flexWrap = 'wrap';
    colorRow.style.gap = '4px';

    const colorBtns = [];
    for (let i = 0; i < COLOR_KEYS.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, COLOR_KEYS[i], COLOR_WORDS[i]);
        btn.style.border = `2px solid ${typeof COLOR_HEX[i] === 'string' && COLOR_HEX[i].startsWith('#') ? COLOR_HEX[i] : '#888'}`;
        btn.style.background = '#222';

        btn.addEventListener('click', () => {
            const idx = COLOR_INDICES[i];
            if (idx === 99) {
                seq.selectRainbow();
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

    // Cue button (= Backspace): start staging a new combo; LIVE keeps playing.
    // Press Play to commit. Does NOT pause.
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '\u29c9 Cue'; // stage-new glyph + label
    resetBtn.style.marginTop = '4px';
    resetBtn.style.width = '100%';
    resetBtn.addEventListener('click', () => {
        app.cueReset();
        refreshAll();
    });
    sectionEl.appendChild(resetBtn);

    // Cue total button (= Shift+Backspace / "<"): stage a new combo with the
    // Solid baseline; LIVE keeps playing. Press Play to commit.
    const totalResetBtn = document.createElement('button');
    totalResetBtn.textContent = '\u29c9 Cue total'; // stage-new + label
    totalResetBtn.style.marginTop = '4px';
    totalResetBtn.style.width = '100%';
    totalResetBtn.addEventListener('click', () => {
        app.totalReset();
        refreshAll();
    });
    sectionEl.appendChild(totalResetBtn);

    // === Pattern Selection ===
    const patHeader = document.createElement('div');
    patHeader.className = 'effect-name';
    patHeader.textContent = 'Pattern (QWERT)';
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
    movHeader.textContent = 'Movement (ASDFGH)';
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
    glowHeader.textContent = 'Glow — Modo rápido (ZXCVB)';
    glowHeader.style.marginTop = '10px';
    sectionEl.appendChild(glowHeader);

    const glowRow = document.createElement('div');
    glowRow.className = 'effect-buttons';
    glowRow.style.flexWrap = 'wrap';
    glowRow.style.gap = '4px';

    const glowBtns = [];
    for (let i = 0; i < GLOW_MODES.length; i++) {
        const btn = document.createElement('button');
        keyLabel(btn, GLOW_KEYS[i], GLOW_WORDS[i]);
        btn.addEventListener('click', () => {
            app.setGlowMode(GLOW_MODES[i]);
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
    moodHeader.textContent = 'Moods (Shift+ZXCVB)';
    moodHeader.style.marginTop = '10px';
    sectionEl.appendChild(moodHeader);

    const moodRow = document.createElement('div');
    moodRow.className = 'effect-buttons';
    moodRow.style.flexWrap = 'wrap';
    moodRow.style.gap = '4px';

    const moodBtns = [];
    for (const { key, hotkey, word } of MOOD_DEFS) {
        const btn = document.createElement('button');
        keyLabel(btn, hotkey, word);
        btn.dataset.moodKey = key === null ? '' : key;
        btn.addEventListener('click', () => {
            if (key === null) {
                app.clearMood();   // None: just clears the active-mood highlight
            } else {
                app.applyMood(MOODS[key], key);
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
    playBtn.textContent = '\u25B6 Play';
    playBtn.addEventListener('click', () => {
        if (seq.staging) {
            app.commitCue();   // commit the staged cue (+ baseline reset if Cue total)
        } else {
            seq.play();
        }
        refreshAll();
        app.updateHUD();
    });

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '\u25A0 Stop';
    stopBtn.addEventListener('click', () => {
        seq.stop();
        app.updateHUD();
    });

    transportRow.appendChild(playBtn);
    transportRow.appendChild(stopBtn);
    sectionEl.appendChild(transportRow);

    // === Refresh functions ===

    // Single declarative table: each button group maps to (a) the buttons,
    // (b) the value identifying each button, and (c) the predicate that decides
    // "active", all derived from the single sources of truth (seq + app).
    // Adding a new group later = add one entry here; nothing else changes.
    function activeStateGroups() {
        return [
            { btns: patBtns,  isActive: i => shownPattern() === PATTERNS[i] },
            { btns: movBtns,  isActive: i => app.currentMovement === MOVEMENTS[i] },
            { btns: glowBtns, isActive: i => app.currentGlowMode === GLOW_MODES[i] },
            { btns: moodBtns, isActive: i => app.currentMood === MOOD_DEFS[i].key },
        ];
    }

    // One routine applies the gold/active style for ALL grouped button banks.
    function refreshActiveStates() {
        for (const { btns, isActive } of activeStateGroups()) {
            for (let i = 0; i < btns.length; i++) {
                const on = isActive(i);
                btns[i].style.background = on ? '#FFD700' : '#333';
                btns[i].style.color = on ? '#000' : '#aaa';
            }
        }
    }

    function refreshAll() {
        updateColorBtns();        // colors use per-button hex, handled separately
        refreshActiveStates();    // pattern + movement + glow + moods, unified
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
            colorBtns[i].style.background = selected ? (COLOR_HEX[i].startsWith('#') ? COLOR_HEX[i] : '#888') : '#222';
            colorBtns[i].style.color = selected ? '#000' : '#aaa';
        }
    }

    // Pattern/movement/glow/mood highlighting is handled by refreshActiveStates()
    // (the unified routine above). These groups read the single sources of truth:
    // seq.pattern, app.currentMovement, app.currentGlowMode, app.currentMood.

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
                const hex = COLOR_HEX[colorIdx + 1]; // offset: COLOR_HEX[0] is empty
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
        : (c >= 0 && c <= 4) ? COLOR_EMOJIS[c + 1] : '\u2B1C';

    function updatePatternPreview() {
        // While staging, the preview shows the PENDING combo being cued (one row
        // per pending color). The live rotation keeps playing behind the scenes.
        if (seq.staging) {
            const pend = seq.pendingColors;
            if (pend.length === 0) {
                patternPreview.textContent = 'Cue: elige colores\u2026 (Play para activar)';
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

    // Initial state
    refreshAll();

    // Return refresh callback for external updates (called from panel.refreshSequencerUI)
    return refreshAll;
}

function createTag(text) {
    const tag = document.createElement('span');
    tag.className = 'layer-tag';
    tag.textContent = text;
    return tag;
}
