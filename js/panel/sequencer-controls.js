// --- Sequencer Controls (visual panel + color selection, pattern, movement, glow) ---
import { CONFIG } from '../config.js';
import { ColorSequencer } from '../color-sequencer.js';

const COLOR_LABELS = ['0:Empty', '1:YEL', '2:BLU', '3:RED', '4:GRN', '5:PUR', '6:Rainbow'];
const COLOR_INDICES = [-1, 0, 1, 2, 3, 4, 99];
const COLOR_HEX = ['#444', '#ffff00', '#55aaff', '#ff0000', '#00ff00', '#ff00ff', 'linear-gradient(90deg,#ff0,#55f,#f00,#0f0,#f0f)'];
const COLOR_EMOJIS = ['\u2B1B', '\uD83D\uDFE8', '\uD83D\uDFE6', '\uD83D\uDFE5', '\uD83D\uDFE9', '\uD83D\uDFEA'];

const PATTERNS = ['solid', 'alternate', 'chase', 'carousel', 'pingpong'];
const PATTERN_LABELS = ['Q Solid', 'W Alternate', 'E Chase', 'R Carousel', 'T Ping-Pong'];

const MOVEMENTS = ['none', 'wave', 'expand', 'broken', 'shake', 'equalizer'];
const MOVEMENT_LABELS = ['A None', 'S Wave', 'D Expand', 'F Broken', 'G Shake', 'Equalizer'];

const GLOW_MODES = ['none', 'static', 'breathe', 'pulse', 'strobe', 'sweep-right'];
const GLOW_LABELS = ['Z None', 'X Static', 'C Breathe', 'V Pulse', 'B Strobe', 'Sweep \u25B6'];

const MOOD_DEFS = [
    { key: 'calm',    label: 'Z Calm' },
    { key: 'build',   label: 'X Build' },
    { key: 'tension', label: 'C Tension' },
    { key: 'peak',    label: 'V Peak' },
    { key: 'mystic',  label: 'B Mystic' },
];

const MOODS = {
    calm:    { colors: [1],    pattern: 'solid',     movement: 'wave',   glow: 'breathe', bpm: 80 },
    build:   { colors: [3, 1], pattern: 'alternate',  movement: 'expand', glow: 'cascade', bpm: 110 },
    tension: { colors: [2, 4], pattern: 'chase',      movement: 'shake',  glow: 'pulse',   bpm: 150 },
    peak:    { colors: [0,1,2,3,4], pattern: 'carousel', movement: 'wave', glow: 'strobe', bpm: 180 },
    mystic:  { colors: [4, -1],pattern: 'pingpong',   movement: 'broken', glow: 'breathe', bpm: 90 },
};

/**
 * Creates sequencer controls and returns a refresh callback for live updates.
 * @returns {Function} refresh callback
 */
export function createSequencerControls(sectionEl, app) {
    const seq = app.sequencer;

    // === State refs for UI updates ===
    let activeMovement = 'none';

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
    for (let i = 0; i < COLOR_LABELS.length; i++) {
        const btn = document.createElement('button');
        btn.textContent = COLOR_LABELS[i];
        btn.style.minWidth = '52px';
        btn.style.fontSize = '10px';
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

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '\u232B Clear';
    clearBtn.style.marginTop = '4px';
    clearBtn.style.width = '100%';
    clearBtn.addEventListener('click', () => {
        seq.clearColors();
        refreshAll();
        app.updateHUD();
    });
    sectionEl.appendChild(clearBtn);

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
        btn.textContent = PATTERN_LABELS[i];
        btn.style.fontSize = '10px';
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
    movHeader.textContent = 'Movement (ASDFG+)';
    movHeader.style.marginTop = '10px';
    sectionEl.appendChild(movHeader);

    const movRow = document.createElement('div');
    movRow.className = 'effect-buttons';
    movRow.style.flexWrap = 'wrap';
    movRow.style.gap = '4px';

    const movBtns = [];
    for (let i = 0; i < MOVEMENTS.length; i++) {
        const btn = document.createElement('button');
        btn.textContent = MOVEMENT_LABELS[i];
        btn.style.fontSize = '10px';
        btn.addEventListener('click', () => {
            activeMovement = MOVEMENTS[i];
            if (activeMovement === 'none') {
                app.stopEffect();
            } else {
                app.playMovement(activeMovement);
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
    glowHeader.textContent = 'Glow (ZXCVB)';
    glowHeader.style.marginTop = '10px';
    sectionEl.appendChild(glowHeader);

    const glowRow = document.createElement('div');
    glowRow.className = 'effect-buttons';
    glowRow.style.flexWrap = 'wrap';
    glowRow.style.gap = '4px';

    const glowBtns = [];
    for (let i = 0; i < GLOW_MODES.length; i++) {
        const btn = document.createElement('button');
        btn.textContent = GLOW_LABELS[i];
        btn.style.fontSize = '10px';
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

    for (const { key, label } of MOOD_DEFS) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.fontSize = '10px';
        btn.addEventListener('click', () => {
            const mood = MOODS[key];
            if (mood) {
                app.applyMood(mood);
                activeMovement = mood.movement || 'none';
                refreshAll();
                app.updateHUD();
            }
        });
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
        seq.play();
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

    function refreshAll() {
        updateColorBtns();
        updatePatBtns();
        updateMovBtns();
        updateGlowBtns();
        updateTags();
        updateMiniStage();
        updateStepDots();
        updatePatternPreview();
        bpmVal.textContent = seq.bpm;
        bpmSlider.value = seq.bpm;
    }

    function updateColorBtns() {
        for (let i = 0; i < colorBtns.length; i++) {
            const idx = COLOR_INDICES[i];
            let selected;
            if (idx === 99) {
                selected = seq.selectedColors.length === 5 && [0,1,2,3,4].every(c => seq.selectedColors.includes(c));
            } else {
                selected = seq.selectedColors.includes(idx);
            }
            colorBtns[i].style.background = selected ? (COLOR_HEX[i].startsWith('#') ? COLOR_HEX[i] : '#888') : '#222';
            colorBtns[i].style.color = selected ? '#000' : '#aaa';
        }
    }

    function updatePatBtns() {
        for (let i = 0; i < patBtns.length; i++) {
            patBtns[i].style.background = seq.pattern === PATTERNS[i] ? '#FFD700' : '#333';
            patBtns[i].style.color = seq.pattern === PATTERNS[i] ? '#000' : '#aaa';
        }
    }

    function updateMovBtns() {
        // Sync from app state
        const current = app.effectEngine.activeName || 'none';
        if (current !== activeMovement) activeMovement = current;
        for (let i = 0; i < movBtns.length; i++) {
            movBtns[i].style.background = activeMovement === MOVEMENTS[i] ? '#FFD700' : '#333';
            movBtns[i].style.color = activeMovement === MOVEMENTS[i] ? '#000' : '#aaa';
        }
    }

    function updateGlowBtns() {
        for (let i = 0; i < glowBtns.length; i++) {
            glowBtns[i].style.background = app.currentGlowMode === GLOW_MODES[i] ? '#FFD700' : '#333';
            glowBtns[i].style.color = app.currentGlowMode === GLOW_MODES[i] ? '#000' : '#aaa';
        }
    }

    function updateTags() {
        const colorNames = seq.selectedColors.map(c => ColorSequencer.colorName(c)?.substring(0, 3) || '?').join(', ');
        tagColors.textContent = `Colors: ${colorNames || '--'}`;
        tagColors.classList.toggle('on', seq.selectedColors.length > 0);

        tagPattern.textContent = `Pattern: ${seq.pattern || '--'}`;
        tagPattern.classList.toggle('on', !!seq.pattern);

        tagMovement.textContent = `Move: ${activeMovement}`;
        tagMovement.classList.toggle('on', activeMovement !== 'none');

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

    function updatePatternPreview() {
        if (seq.frames.length === 0) {
            patternPreview.textContent = 'Select colors and a pattern';
            return;
        }
        const current = seq.currentStep % seq.frames.length;
        patternPreview.innerHTML = seq.frames.map((frame, i) => {
            const emoji = frame.map(c => {
                if (c === -1) return COLOR_EMOJIS[0]; // black square
                if (c >= 0 && c <= 4) return COLOR_EMOJIS[c + 1];
                return '\u2B1C';
            }).join('');
            return `<div class="step-line${i === current ? ' current' : ''}">${emoji}</div>`;
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
