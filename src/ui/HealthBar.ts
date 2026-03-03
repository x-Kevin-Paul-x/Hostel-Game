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

    // Burst meter
    private burstValue: number = 0;
    private maxBurstValue: number = 100;

    // Retro styling - enhanced
    private slantWidth: number = 25;
    private borderWidth: number = 3;
    private innerPadding: number = 3;

    // Animation
    private pulseTimer: number = 0;
    private isLowHealth: boolean = false;

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

        // Add update loop for animations
        this.scene.events.on('update', this.update, this);
    }

    private update() {
        this.pulseTimer += 0.1;
        if (this.isLowHealth) {
            this.draw(); // Redraw for pulse effect
        }
    }

    setHealth(value: number) {
        this.targetValue = Phaser.Math.Clamp(value, 0, this.maxValue);
        this.isLowHealth = this.targetValue / this.maxValue < 0.25;
        this.draw();

        // Tween damage bar effect
        this.scene.tweens.addCounter({
            from: this.currentValue,
            to: this.targetValue,
            duration: 400,
            delay: 200,
            ease: 'Power2',
            onUpdate: (tween) => {
                this.currentValue = tween.getValue() ?? this.currentValue;
                this.draw();
            }
        });
    }

    setBurstMeter(value: number) {
        this.burstValue = Phaser.Math.Clamp(value, 0, this.maxBurstValue);
        this.draw();
    }

    private draw() {
        this.graphics.clear();

        const w = this.width;
        const h = this.height;
        const slant = this.slantWidth;
        const border = this.borderWidth;
        const pad = this.innerPadding;

        if (this.isLeft) {
            this.drawLeftBar(w, h, slant, border, pad);
        } else {
            this.drawRightBar(w, h, slant, border, pad);
        }
    }

    private drawLeftBar(w: number, h: number, slant: number, border: number, pad: number) {
        // Outer glow/shadow effect
        this.graphics.fillStyle(0x000000, 0.4);
        this.graphics.beginPath();
        this.graphics.moveTo(3, 3);
        this.graphics.lineTo(w - slant + 3, 3);
        this.graphics.lineTo(w + 3, h + 3);
        this.graphics.lineTo(3, h + 3);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Outer frame with slanted right edge (metallic dark)
        this.graphics.fillStyle(0x1a1a2e);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(w - slant, 0);
        this.graphics.lineTo(w, h);
        this.graphics.lineTo(0, h);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Border highlight (top-left light) - metallic effect
        this.graphics.lineStyle(2, 0x8a8aaa);
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

        // Inner background (dark with gradient simulation)
        const innerSlant = slant - border;
        this.graphics.fillStyle(0x0d0d1a);
        this.graphics.beginPath();
        this.graphics.moveTo(border, border);
        this.graphics.lineTo(w - slant - border + innerSlant, border);
        this.graphics.lineTo(w - border, h - border);
        this.graphics.lineTo(border, h - border);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Inner top gradient
        this.graphics.fillStyle(0x15152a, 0.8);
        this.graphics.fillRect(border, border, w - slant - border * 2, 6);

        // Damage bar (white/red glow) - shows previous health
        const damagePercent = this.currentValue / this.maxValue;
        if (damagePercent > 0 && damagePercent !== this.targetValue / this.maxValue) {
            const damageWidth = (w - border * 2 - pad * 2 - slant * 0.5) * damagePercent;
            this.graphics.fillStyle(0xff4444, 0.6);
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

            // Get color based on health with pulse effect for low health
            let mainColor = 0x00dd00;
            let lightColor = 0x66ff66;
            let darkColor = 0x006600;
            let glowColor = 0x00ff00;

            if (healthPercent < 0.25) {
                const pulse = this.isLowHealth ? 0.7 + Math.sin(this.pulseTimer * 3) * 0.3 : 1;
                mainColor = Phaser.Display.Color.GetColor(
                    Math.floor(220 * pulse),
                    0,
                    0
                );
                lightColor = 0xff4444;
                darkColor = 0x660000;
                glowColor = 0xff0000;
            } else if (healthPercent < 0.5) {
                mainColor = 0xddaa00;
                lightColor = 0xffcc44;
                darkColor = 0x886600;
                glowColor = 0xffaa00;
            }

            // Glow effect under health bar
            this.graphics.fillStyle(glowColor, 0.15);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad - 2, border + pad - 2);
            this.graphics.lineTo(border + pad + healthWidth + 2, border + pad - 2);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.3) + 2, h - border - pad + 2);
            this.graphics.lineTo(border + pad - 2, h - border - pad + 2);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Main health bar with slant
            this.graphics.fillStyle(mainColor);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, border + pad);
            this.graphics.lineTo(border + pad + healthWidth, border + pad);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(border + pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Top highlight stripe (gradient effect)
            this.graphics.fillStyle(lightColor, 0.9);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, border + pad);
            this.graphics.lineTo(border + pad + healthWidth, border + pad);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.1), border + pad + 5);
            this.graphics.lineTo(border + pad, border + pad + 5);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Bottom shadow stripe  
            this.graphics.fillStyle(darkColor);
            this.graphics.beginPath();
            this.graphics.moveTo(border + pad, h - border - pad - 5);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.25), h - border - pad - 5);
            this.graphics.lineTo(border + pad + healthWidth + (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(border + pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Shine effect (multiple small highlights)
            this.graphics.fillStyle(0xffffff, 0.5);
            this.graphics.fillRect(border + pad + 6, border + pad + 2, 12, 2);
            this.graphics.fillRect(border + pad + 22, border + pad + 2, 6, 2);
            this.graphics.fillRect(border + pad + 32, border + pad + 2, 3, 2);
        }

        // Decorative corner accents
        this.graphics.fillStyle(0xffcc00);
        this.graphics.fillRect(0, 0, 6, 6);
        this.graphics.fillRect(0, h - 6, 6, 6);
        this.graphics.fillStyle(0xffffff, 0.6);
        this.graphics.fillRect(1, 1, 3, 3);

        // Inner corner details
        this.graphics.fillStyle(0x4a4a6a);
        this.graphics.fillRect(6, 0, 2, 4);
        this.graphics.fillRect(0, 6, 4, 2);

        // Draw burst meter below health bar
        this.drawBurstMeter(w, h, border, true);
    }

    private drawRightBar(w: number, h: number, slant: number, border: number, pad: number) {
        // Outer glow/shadow effect
        this.graphics.fillStyle(0x000000, 0.4);
        this.graphics.beginPath();
        this.graphics.moveTo(3, 3);
        this.graphics.lineTo(-w + slant + 3, 3);
        this.graphics.lineTo(-w + 3, h + 3);
        this.graphics.lineTo(3, h + 3);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Draw from right to left (mirrored)
        this.graphics.fillStyle(0x1a1a2e);
        this.graphics.beginPath();
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(-w + slant, 0);
        this.graphics.lineTo(-w, h);
        this.graphics.lineTo(0, h);
        this.graphics.closePath();
        this.graphics.fillPath();

        // Border highlight
        this.graphics.lineStyle(2, 0x8a8aaa);
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

        // Inner top gradient
        this.graphics.fillStyle(0x15152a, 0.8);
        this.graphics.fillRect(-w + slant + border, border, w - slant - border * 2, 6);

        // Damage bar
        const damagePercent = this.currentValue / this.maxValue;
        if (damagePercent > 0 && damagePercent !== this.targetValue / this.maxValue) {
            const damageWidth = (w - border * 2 - pad * 2 - slant * 0.5) * damagePercent;
            this.graphics.fillStyle(0xff4444, 0.6);
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
            let lightColor = 0x66ff66;
            let darkColor = 0x006600;
            let glowColor = 0x00ff00;

            if (healthPercent < 0.25) {
                const pulse = this.isLowHealth ? 0.7 + Math.sin(this.pulseTimer * 3) * 0.3 : 1;
                mainColor = Phaser.Display.Color.GetColor(
                    Math.floor(220 * pulse),
                    0,
                    0
                );
                lightColor = 0xff4444;
                darkColor = 0x660000;
                glowColor = 0xff0000;
            } else if (healthPercent < 0.5) {
                mainColor = 0xddaa00;
                lightColor = 0xffcc44;
                darkColor = 0x886600;
                glowColor = 0xffaa00;
            }

            // Glow effect
            this.graphics.fillStyle(glowColor, 0.15);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad + 2, border + pad - 2);
            this.graphics.lineTo(-border - pad - healthWidth - 2, border + pad - 2);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.3) - 2, h - border - pad + 2);
            this.graphics.lineTo(-border - pad + 2, h - border - pad + 2);
            this.graphics.closePath();
            this.graphics.fillPath();

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
            this.graphics.fillStyle(lightColor, 0.9);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad, border + pad);
            this.graphics.lineTo(-border - pad - healthWidth, border + pad);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.1), border + pad + 5);
            this.graphics.lineTo(-border - pad, border + pad + 5);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Bottom shadow
            this.graphics.fillStyle(darkColor);
            this.graphics.beginPath();
            this.graphics.moveTo(-border - pad, h - border - pad - 5);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.25), h - border - pad - 5);
            this.graphics.lineTo(-border - pad - healthWidth - (slant * healthPercent * 0.3), h - border - pad);
            this.graphics.lineTo(-border - pad, h - border - pad);
            this.graphics.closePath();
            this.graphics.fillPath();

            // Shine
            this.graphics.fillStyle(0xffffff, 0.5);
            this.graphics.fillRect(-border - pad - 18, border + pad + 2, 12, 2);
            this.graphics.fillRect(-border - pad - 28, border + pad + 2, 6, 2);
            this.graphics.fillRect(-border - pad - 35, border + pad + 2, 3, 2);
        }

        // Decorative corner accents
        this.graphics.fillStyle(0xffcc00);
        this.graphics.fillRect(-6, 0, 6, 6);
        this.graphics.fillRect(-6, h - 6, 6, 6);
        this.graphics.fillStyle(0xffffff, 0.6);
        this.graphics.fillRect(-4, 1, 3, 3);

        // Inner corner details
        this.graphics.fillStyle(0x4a4a6a);
        this.graphics.fillRect(-8, 0, 2, 4);
        this.graphics.fillRect(-4, 6, 4, 2);

        // Draw burst meter below health bar
        this.drawBurstMeter(w, h, border, false);
    }

    private drawBurstMeter(w: number, h: number, border: number, isLeft: boolean) {
        const burstHeight = 10;
        const burstY = h + 6;
        const burstWidth = w * 0.6;
        const burstPercent = this.burstValue / this.maxBurstValue;

        if (isLeft) {
            // Background
            this.graphics.fillStyle(0x0a0a1a);
            this.graphics.fillRoundedRect(border, burstY, burstWidth, burstHeight, 3);
            this.graphics.lineStyle(1, 0x3a3a5a);
            this.graphics.strokeRoundedRect(border, burstY, burstWidth, burstHeight, 3);

            // Fill
            if (burstPercent > 0) {
                const fillWidth = (burstWidth - 4) * burstPercent;

                // Determine color based on fill level
                let burstColor = 0x4488ff;
                let glowColor = 0x4488ff;
                if (burstPercent >= 1) {
                    burstColor = 0xffcc00;
                    glowColor = 0xffcc00;
                } else if (burstPercent >= 0.5) {
                    burstColor = 0x66aaff;
                    glowColor = 0x66aaff;
                }

                // Glow when full
                if (burstPercent >= 1) {
                    this.graphics.fillStyle(glowColor, 0.3);
                    this.graphics.fillRoundedRect(border - 2, burstY - 2, burstWidth + 4, burstHeight + 4, 4);
                }

                this.graphics.fillStyle(burstColor);
                this.graphics.fillRoundedRect(border + 2, burstY + 2, fillWidth, burstHeight - 4, 2);

                // Highlight
                this.graphics.fillStyle(0xffffff, 0.4);
                this.graphics.fillRect(border + 3, burstY + 2, fillWidth - 2, 2);
            }

            // Label
            this.graphics.fillStyle(0x6a6a8a);
        } else {
            // Background (mirrored)
            this.graphics.fillStyle(0x0a0a1a);
            this.graphics.fillRoundedRect(-border - burstWidth, burstY, burstWidth, burstHeight, 3);
            this.graphics.lineStyle(1, 0x3a3a5a);
            this.graphics.strokeRoundedRect(-border - burstWidth, burstY, burstWidth, burstHeight, 3);

            // Fill
            if (burstPercent > 0) {
                const fillWidth = (burstWidth - 4) * burstPercent;

                let burstColor = 0x4488ff;
                let glowColor = 0x4488ff;
                if (burstPercent >= 1) {
                    burstColor = 0xffcc00;
                    glowColor = 0xffcc00;
                } else if (burstPercent >= 0.5) {
                    burstColor = 0x66aaff;
                    glowColor = 0x66aaff;
                }

                if (burstPercent >= 1) {
                    this.graphics.fillStyle(glowColor, 0.3);
                    this.graphics.fillRoundedRect(-border - burstWidth - 2, burstY - 2, burstWidth + 4, burstHeight + 4, 4);
                }

                this.graphics.fillStyle(burstColor);
                this.graphics.fillRoundedRect(-border - 2 - fillWidth, burstY + 2, fillWidth, burstHeight - 4, 2);

                // Highlight
                this.graphics.fillStyle(0xffffff, 0.4);
                this.graphics.fillRect(-border - 1 - fillWidth, burstY + 2, fillWidth - 2, 2);
            }
        }
    }

    destroy() {
        this.scene.events.off('update', this.update, this);
        this.barContainer.destroy();
    }
}
