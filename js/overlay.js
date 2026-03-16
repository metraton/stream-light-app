// --- Text Overlay ---
import { CONFIG } from './config.js';

export class Overlay {
    constructor(pixiApp) {
        this.pixiApp = pixiApp;
        this.container = null;
        this.visible = CONFIG.overlay.visible;
    }

    create() {
        this.container = new PIXI.Container();

        const mainStyle = new PIXI.TextStyle({
            fontFamily: 'Impact, "Arial Black", sans-serif',
            fontSize: 140,
            fontWeight: 'bold',
            fill: 'rgba(255, 220, 120, 0.35)',
            stroke: { color: '#B8860B', width: 3 },
            letterSpacing: 12,
            dropShadow: {
                color: 'rgba(0,0,0,0.5)',
                blur: 8,
                distance: 4,
                angle: Math.PI / 4,
            },
        });

        const mainText = new PIXI.Text({
            text: CONFIG.overlay.mainText,
            style: mainStyle,
        });
        mainText.anchor.set(0.5, 0.5);
        mainText.x = this.pixiApp.screen.width / 2;
        mainText.y = this.pixiApp.screen.height / 2 + 40;
        this.container.addChild(mainText);

        const subStyle = new PIXI.TextStyle({
            fontFamily: 'Impact, "Arial Black", sans-serif',
            fontSize: 70,
            fontWeight: 'bold',
            fill: 'rgba(255, 220, 120, 0.35)',
            stroke: { color: '#B8860B', width: 2 },
            letterSpacing: 6,
        });

        const subText = new PIXI.Text({
            text: CONFIG.overlay.subText,
            style: subStyle,
        });
        subText.anchor.set(1, 0);
        subText.x = this.pixiApp.screen.width - CONFIG.columns.margin - 10;
        subText.y = this.pixiApp.screen.height / 2 + 110;
        this.container.addChild(subText);

        this.pixiApp.stage.addChild(this.container);
        this.container.visible = this.visible;
    }

    toggle() {
        this.visible = !this.visible;
        if (this.container) this.container.visible = this.visible;
    }

    // Ensure overlay stays on top (call after column rebuild)
    moveToTop() {
        if (this.container) {
            this.pixiApp.stage.removeChild(this.container);
            this.pixiApp.stage.addChild(this.container);
        }
    }
}
