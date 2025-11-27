import Phaser from 'phaser';

export class HealthBar {
    private scene: Phaser.Scene;
    private width: number;
    private height: number;
    private isLeft: boolean;

    private barContainer: Phaser.GameObjects.Container;
    private graphics: Phaser.GameObjects.Graphics;

    private currentValue: number;
    private targetValue: number;
    private maxValue: number;
    
    // Retro styling
    private slantWidth: number = 20; // Width of the slanted edge
    private borderWidth: number = 4;
    private innerPadding: number = 4;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, maxValue: number, isLeft: boolean = true) {
        this.scene = scene;
        this.width = width;
        this.height = height;
        this.maxValue = maxValue;
        this.currentValue = maxValue;
        this.targetValue = maxValue;
        this.isLeft = isLeft;

        this.barContainer = this.scene.add.container(x, y);
        this.graphics = this.scene.add.graphics();
        this.barContainer.add(this.graphics);

        this.draw();
    }

    setHealth(value: number) {
        this.targetValue = Phaser.Math.Clamp(value, 0, this.maxValue);
        this.draw();

        // Tween damage bar effect
        this.scene.tweens.addCounter({
            from: this.currentValue,
            to: this.targetValue,
            duration: 400,
            delay: 300,
            ease: 'Power2',
            onUpdate: (tween) => {
                this.currentValue = tween.getValue() ?? this.currentValue;
                this.draw();
            }
        });
    }

    private draw() {
        this.graphics.clear();

        const w = this.width;
        const h = this.height;
        const slant = this.slantWidth;
        const border = this.borderWidth;
        const pad = this.innerPadding;

        // For left bar: slant on right side
        // For right bar: slant on left side, draw from right to left
        
        if (this.isLeft) {
            this.drawLeftBar(w, h, slant, border, pad);
        } else {
            this.drawRightBar(w, h, slant, border, pad);
        }
    }

    private drawLeftBar(w: number, h: number, slant: number, border: number, pad: number) {
        // Outer frame with slanted right edge (metallic dark)
        this.graphics.fillStyle(0x1a1a2e);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(w - slant, 0);
        this.graphics.lineTo(w, h);
        this.graphics.lineTo(0, h);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Border highlight (top-left light)
        this.graphics.lineStyle(2, 0x6a6a8a);
        this.graphics.beginPath();
        this.graphics.moveTo(0, h);
        this.graphics.lineTo(0, 0);
        this.graphics.lineTo(w - slant, 0);
        this.graphics.strokePath();

        // Border shadow (bottom-right dark)
        this.graphics.lineStyle(2, 0x0a0a1e);
        this.graphics.beginPath();
        this.graphics.moveTo(w - slant, 0);
        this.graphics.lineTo(w, h);
        this.graphics.lineTo(0, h);
        this.graphics.strokePath();

        // Inner background (dark)
        const innerSlant = slant - border;
        this.graphics.fillStyle(0x0d0d1a);
        this.graphics.beginPath();
        this.graphics.moveTo(border, border);
        this.graphics.lineTo(w - slant - border + innerSlant, border);
        this.graphics.lineTo(w - border, h - border);
        this.graphics.lineTo(border, h - border);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Damage bar (white/red glow) - shows previous health
        const damagePercent = this.currentValue / this.maxValue;
        if (damagePercent > 0) {
            const damageWidth = (w - border * 2 - pad * 2 - slant * 0.5) * damagePercent;
            this.graphics.fillStyle(0xff6666, 0.7);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, border + pad);
            this.graphics.lineTo(border + pad + damageWidth, border + pad);
            this.graphics.lineTo(border + pad + damageWidth + (slant * damagePercent * 0.3), h - border - pad);
            this.graphics.lineTo(border + pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();
        }

        // Health bar with gradient effect
        const healthPercent = this.targetValue / this.maxValue;
        if (healthPercent > 0) {
            const healthWidth = (w - border * 2 - pad * 2 - slant * 0.5) * healthPercent;
            
            // Get color based on health
            let mainColor = 0x00dd00;
            let lightColor = 0x44ff44;
            let darkColor = 0x008800;
            
            if (healthPercent < 0.3) {
                mainColor = 0xdd0000;
                lightColor = 0xff4444;
                darkColor = 0x880000;
            } else if (healthPercent < 0.6) {
                mainColor = 0xdddd00;
                lightColor = 0xffff44;
                darkColor = 0x888800;
            }

            // Main health bar with slant
            this.graphics.fillStyle(mainColor);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, border + pad);
            this.graphics.lineTo(border + pad + healthWidth, border + pad);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(border + pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Top highlight stripe
            this.graphics.fillStyle(lightColor);
            this.graphics.fillRect(border + pad, border + pad, healthWidth, 4);

            // Bottom shadow stripe  
            this.graphics.fillStyle(darkColor);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, h - border - pad - 4);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.25), h - border - pad - 4);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(border + pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Pixel shine effect
            this.graphics.fillStyle(0xffffff, 0.4);
            this.graphics.fillRect(border + pad + 4, border + pad + 2, 8, 2);
            this.graphics.fillRect(border + pad + 16, border + pad + 2, 4, 2);
        }

        // Decorative corner pixels
        this.graphics.fillStyle(0xffcc00);
        this.graphics.fillRect(0, 0, 4, 4);
        this.graphics.fillRect(0, h - 4, 4, 4);
    }

    private drawRightBar(w: number, h: number, slant: number, border: number, pad: number) {
        // Draw from right to left (mirrored)
        // Outer frame with slanted left edge
        this.graphics.fillStyle(0x1a1a2e);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(-w + slant, 0);
        this.graphics.lineTo(-w, h);
        this.graphics.lineTo(0, h);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Border highlight
        this.graphics.lineStyle(2, 0x6a6a8a);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(0, h);
        this.graphics.lineTo(-w, h);
        this.graphics.strokePath();

        // Border shadow
        this.graphics.lineStyle(2, 0x0a0a1e);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(-w + slant, 0);
        this.graphics.lineTo(-w, h);
        this.graphics.strokePath();

        // Inner background
        const innerSlant = slant - border;
        this.graphics.fillStyle(0x0d0d1a);
        this.graphics.beginPath();
        this.graphics.moveTo(-border, border);
        this.graphics.lineTo(-w + slant + border - innerSlant, border);
        this.graphics.lineTo(-w + border, h - border);
        this.graphics.lineTo(-border, h - border);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Damage bar
        const damagePercent = this.currentValue / this.maxValue;
        if (damagePercent > 0) {
            const damageWidth = (w - border * 2 - pad * 2 - slant * 0.5) * damagePercent;
            this.graphics.fillStyle(0xff6666, 0.7);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad, border + pad);
            this.graphics.lineTo(-border - pad - damageWidth, border + pad);
            this.graphics.lineTo(-border - pad - damageWidth - (slant * damagePercent * 0.3), h - border - pad);
            this.graphics.lineTo(-border - pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();
        }

        // Health bar
        const healthPercent = this.targetValue / this.maxValue;
        if (healthPercent > 0) {
            const healthWidth = (w - border * 2 - pad * 2 - slant * 0.5) * healthPercent;
            
            let mainColor = 0x00dd00;
            let lightColor = 0x44ff44;
            let darkColor = 0x008800;
            
            if (healthPercent < 0.3) {
                mainColor = 0xdd0000;
                lightColor = 0xff4444;
                darkColor = 0x880000;
            } else if (healthPercent < 0.6) {
                mainColor = 0xdddd00;
                lightColor = 0xffff44;
                darkColor = 0x888800;
            }

            // Main bar
            this.graphics.fillStyle(mainColor);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad, border + pad);
            this.graphics.lineTo(-border - pad - healthWidth, border + pad);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(-border - pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Top highlight
            this.graphics.fillStyle(lightColor);
            this.graphics.fillRect(-border - pad - healthWidth, border + pad, healthWidth, 4);

            // Bottom shadow
            this.graphics.fillStyle(darkColor);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad, h - border - pad - 4);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.25), h - border - pad - 4);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(-border - pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Pixel shine
            this.graphics.fillStyle(0xffffff, 0.4);
            this.graphics.fillRect(-border - pad - 12, border + pad + 2, 8, 2);
            this.graphics.fillRect(-border - pad - 20, border + pad + 2, 4, 2);
        }

        // Decorative corner pixels
        this.graphics.fillStyle(0xffcc00);
        this.graphics.fillRect(-4, 0, 4, 4);
        this.graphics.fillRect(-4, h - 4, 4, 4);
    }
}
