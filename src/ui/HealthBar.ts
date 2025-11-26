import Phaser from 'phaser';

export class HealthBar {
    private scene: Phaser.Scene;
    private x: number;
    private y: number;
    private width: number;
    private height: number;
    private isLeft: boolean;

    private barContainer: Phaser.GameObjects.Container;
    private bgBar: Phaser.GameObjects.Graphics;
    private healthBar: Phaser.GameObjects.Graphics;
    private damageBar: Phaser.GameObjects.Graphics;
    private border: Phaser.GameObjects.Graphics;

    private currentValue: number;
    private targetValue: number;
    private maxValue: number;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, maxValue: number, isLeft: boolean = true) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.maxValue = maxValue;
        this.currentValue = maxValue;
        this.targetValue = maxValue;
        this.isLeft = isLeft;

        this.barContainer = this.scene.add.container(x, y);

        // Initialize Graphics
        this.bgBar = this.scene.add.graphics();
        this.damageBar = this.scene.add.graphics();
        this.healthBar = this.scene.add.graphics();
        this.border = this.scene.add.graphics();

        this.barContainer.add([this.bgBar, this.damageBar, this.healthBar, this.border]);

        this.draw();
    }

    setHealth(value: number) {
        this.targetValue = Phaser.Math.Clamp(value, 0, this.maxValue);

        // Instant update for health bar, delayed for damage bar is handled in update if we wanted, 
        // but for now let's just tween the damage bar or health bar.
        // Actually, standard fighting game: Health drops instantly, damage bar lingers then drops.

        this.draw();

        // Tween damage bar after delay
        this.scene.tweens.addCounter({
            from: this.currentValue,
            to: this.targetValue,
            duration: 500,
            delay: 500,
            ease: 'Linear',
            onUpdate: (tween) => {
                this.currentValue = tween.getValue() ?? this.currentValue;
                this.drawDamageBar();
            }
        });
    }

    private draw() {
        this.bgBar.clear();
        this.healthBar.clear();
        this.border.clear();

        const originX = this.isLeft ? 0 : -this.width;

        // Background
        this.bgBar.fillStyle(0x333333);
        this.bgBar.fillRect(originX, 0, this.width, this.height);

        // Border
        this.border.lineStyle(4, 0x000000);
        this.border.strokeRect(originX, 0, this.width, this.height);

        // Health
        const percent = this.targetValue / this.maxValue;
        const healthWidth = this.width * percent;

        // Color based on health
        let color = 0x00ff00;
        if (percent < 0.3) color = 0xff0000;
        else if (percent < 0.6) color = 0xffff00;

        this.healthBar.fillStyle(color);
        if (this.isLeft) {
            this.healthBar.fillRect(0, 0, healthWidth, this.height);
        } else {
            this.healthBar.fillRect(0, 0, -healthWidth, this.height); // Fill from right
        }

        this.drawDamageBar();
    }

    private drawDamageBar() {
        this.damageBar.clear();
        const originX = this.isLeft ? 0 : -this.width;

        // Damage bar (white/red behind health)
        // It should be from current health to previous health (currentValue)
        // But simpler: Draw damage bar representing 'currentValue' (lagging health), 
        // and health bar draws 'targetValue' (actual health) on top.

        const percent = this.currentValue / this.maxValue;
        const damageWidth = this.width * percent;

        this.damageBar.fillStyle(0xffffff); // White flash/linger
        if (this.isLeft) {
            this.damageBar.fillRect(0, 0, damageWidth, this.height);
        } else {
            this.damageBar.fillRect(0, 0, -damageWidth, this.height);
        }

        // Re-draw health on top to ensure it covers damage bar
        // (Actually, we added them in order: bg, damage, health, border. So health is already on top)
        // But we need to make sure damage bar is only visible where health isn't.
        // Since damage bar width >= health bar width (usually), it works out.
    }
}
