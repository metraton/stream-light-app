// --- HUD Display ---

export class HUD {
    constructor() {
        this.visible = true;
        this.colorEl = document.getElementById('hud-color');
        this.effectEl = document.getElementById('hud-effect');
        this.fpsEl = document.getElementById('hud-fps');
        this.hudEl = document.getElementById('hud');
    }

    update(colorMode, effectName, glowName, bpm) {
        if (this.colorEl) this.colorEl.textContent = colorMode || '--';
        if (this.effectEl) {
            const parts = [];
            if (effectName) parts.push(`mov:${effectName}`);
            if (glowName) parts.push(`glow:${glowName}`);
            if (bpm) parts.push(`${bpm}bpm`);
            this.effectEl.textContent = parts.join(' | ') || '--';
        }
    }

    updateFPS(fps) {
        if (this.fpsEl) this.fpsEl.textContent = Math.round(fps);
    }

    toggle() {
        this.visible = !this.visible;
        if (this.hudEl) this.hudEl.classList.toggle('hidden', !this.visible);
    }
}
