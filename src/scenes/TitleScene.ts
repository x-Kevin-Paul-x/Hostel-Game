import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create() {
        const { width, height } = this.scale;

        // Background (Dark gradient)
        this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a1a);

        // Title Text
        this.add.text(width / 2, height / 3, 'HOSTEL FIGHTER', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '64px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 8,
            shadow: { offsetX: 4, offsetY: 4, color: '#000', blur: 0, stroke: true, fill: true }
        }).setOrigin(0.5);

        // Subtitle / Instructions
        const startText = this.add.text(width / 2, height / 1.5, 'PRESS SPACE TO START', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Blinking effect for start text
        this.tweens.add({
            targets: startText,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            yoyo: true,
            repeat: -1
        });

        // Input to start game
        this.input.keyboard?.once('keydown-SPACE', () => {
            this.scene.start('BootScene');
        });

        // Also allow clicking
        this.input.once('pointerdown', () => {
            this.scene.start('BootScene');
        });
    }
}
