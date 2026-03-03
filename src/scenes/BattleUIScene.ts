import Phaser from 'phaser';
import { HealthBar } from '../ui/HealthBar';


export class BattleUIScene extends Phaser.Scene {
    private p1HealthBar!: HealthBar;
    private p2HealthBar!: HealthBar;
    private timerText!: Phaser.GameObjects.Text;

    private p1WinIndicators: Phaser.GameObjects.Graphics[] = [];
    private p2WinIndicators: Phaser.GameObjects.Graphics[] = [];
    private ROUNDS_TO_WIN = 2;

    private p1CharName: string = '';
    private p2CharName: string = '';

    constructor() {
        super({ key: 'BattleUIScene' });
    }

    init(data: { p1CharName: string, p2CharName: string, maxRounds: number }) {
        this.p1CharName = data.p1CharName || 'P1';
        this.p2CharName = data.p2CharName || 'P2';
        this.ROUNDS_TO_WIN = data.maxRounds || 2;
    }

    create() {
        const { width } = this.scale;

        // Top Panel
        this.createRetroTopPanel(width);

        // Name plates
        this.createNamePlate(30, 20, this.p1CharName, 100, 37);
        this.createNamePlate(width - 170, 20, this.p2CharName, width - 100, 37);

        // Health Bars
        const healthBarWidth = Math.min(400, (width - 250) / 2);
        this.p1HealthBar = new HealthBar(this, 50, 60, healthBarWidth, 35, 100, true);
        this.p2HealthBar = new HealthBar(this, width - 50, 60, healthBarWidth, 35, 100, false);

        // Timer
        this.createRetroTimer(width);

        // Settings Button
        this.createSettingsButton();

        // Round Win Indicators
        this.createRoundWinIndicators();

        // Listen for events from BattleScene
        const battleScene = this.scene.get('BattleScene');
        battleScene.events.on('updateTimer', this.updateTimer, this);
        battleScene.events.on('updateHealth', this.updateHealth, this);
        battleScene.events.on('updateRounds', this.updateRoundWinIndicators, this);
        battleScene.events.on('showRoundResult', this.showRoundResult, this);
        battleScene.events.on('showMatchOver', this.showMatchOver, this);
        battleScene.events.on('startRoundSequence', this.startRoundSequence, this);
    }

    private createNamePlate(bgX: number, bgY: number, name: string, textX: number, textY: number) {
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1a2e);
        bg.fillRoundedRect(bgX, bgY, 140, 35, 4);
        bg.lineStyle(2, 0xffcc00);
        bg.strokeRoundedRect(bgX, bgY, 140, 35, 4);

        const displayName = name.toUpperCase().substring(0, 8);
        this.add.text(textX, textY, displayName, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
    }

    private createRetroTopPanel(width: number) {
        const graphics = this.add.graphics();
        const centerX = width / 2;
        const frameWidth = 120;
        const frameHeight = 80;

        graphics.fillStyle(0x1a1a2e);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth / 2 - 15, 0);
        graphics.lineTo(centerX + frameWidth / 2 + 15, 0);
        graphics.lineTo(centerX + frameWidth / 2, frameHeight);
        graphics.lineTo(centerX - frameWidth / 2, frameHeight);
        graphics.closePath();
        graphics.fillPath();

        graphics.lineStyle(3, 0xffcc00);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth / 2, frameHeight);
        graphics.lineTo(centerX - frameWidth / 2 - 15, 0);
        graphics.moveTo(centerX + frameWidth / 2, frameHeight);
        graphics.lineTo(centerX + frameWidth / 2 + 15, 0);
        graphics.lineTo(centerX - frameWidth / 2 - 15, 0);
        graphics.strokePath();

        graphics.lineStyle(3, 0x6a6a8a);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth / 2, frameHeight);
        graphics.lineTo(centerX + frameWidth / 2, frameHeight);
        graphics.strokePath();

        graphics.fillStyle(0xffcc00);
        graphics.fillRect(centerX - frameWidth / 2 - 10, 5, 6, 6);
        graphics.fillRect(centerX + frameWidth / 2 + 4, 5, 6, 6);

        this.add.text(centerX, 15, 'VS', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#ff6666',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);
    }

    private createRetroTimer(width: number) {
        const centerX = width / 2;
        const timerBg = this.add.graphics();
        timerBg.fillStyle(0x0d0d1a);
        timerBg.fillRoundedRect(centerX - 40, 28, 80, 45, 6);
        timerBg.lineStyle(2, 0x4a4a6a);
        timerBg.strokeRoundedRect(centerX - 40, 28, 80, 45, 6);

        this.timerText = this.add.text(centerX, 50, '99', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '32px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: { offsetX: 0, offsetY: 0, color: '#ffcc00', blur: 8, fill: true }
        }).setOrigin(0.5);

        this.add.text(centerX, 78, 'TIME', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: '#6a6a8a'
        }).setOrigin(0.5);
    }

    private createSettingsButton() {
        const { width } = this.scale;
        const btnSize = 40;
        const padding = 20;
        const btnX = width - btnSize / 2 - padding;
        const btnY = btnSize / 2 + padding + 100;

        const btnBg = this.add.rectangle(btnX, btnY, btnSize, btnSize, 0x1a1a2e);
        btnBg.setStrokeStyle(2, 0xffcc00);
        btnBg.setInteractive({ useHandCursor: true });

        this.add.text(btnX, btnY, '⚙', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffcc00'
        }).setOrigin(0.5);

        btnBg.on('pointerover', () => btnBg.setFillStyle(0x2a2a4a));
        btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a1a2e));
        btnBg.on('pointerdown', () => {
            const battleScene = this.scene.get('BattleScene');
            battleScene.scene.pause();
            this.scene.pause();

            battleScene.events.emit('pauseMusic');
            this.scene.launch('SettingsScene', { calledFrom: 'BattleScene' });
        });

        this.events.on('resume', () => {
            const battleScene = this.scene.get('BattleScene');
            battleScene.events.emit('resumeMusic');
        });
    }

    private createRoundWinIndicators() {
        const { width } = this.scale;
        const indicatorY = 37;
        const indicatorSize = 10;
        const indicatorSpacing = 22;

        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.add.graphics();
            const x = 185 + (i * indicatorSpacing);
            this.drawWinIndicator(indicator, x, indicatorY, indicatorSize, false);
            this.p1WinIndicators.push(indicator);
        }

        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.add.graphics();
            const x = width - 195 - (i * indicatorSpacing);
            this.drawWinIndicator(indicator, x, indicatorY, indicatorSize, false);
            this.p2WinIndicators.push(indicator);
        }
    }

    private drawWinIndicator(indicator: Phaser.GameObjects.Graphics, x: number, y: number, size: number, isWon: boolean) {
        indicator.clear();
        if (isWon) {
            indicator.fillStyle(0x00dd00);
            indicator.fillRoundedRect(x - size / 2, y - size / 2, size, size, 2);
            indicator.lineStyle(2, 0x00ff00);
            indicator.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 2);
        } else {
            indicator.fillStyle(0x0d0d1a);
            indicator.fillRoundedRect(x - size / 2, y - size / 2, size, size, 2);
            indicator.lineStyle(2, 0xffcc00);
            indicator.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 2);
        }
    }

    // --- EVENT HANDLERS ---

    public updateTimer(time: number) {
        this.timerText.setText(time.toString());
    }

    public updateHealth(p1Hp: number, p2Hp: number, p1Burst: number, p2Burst: number) {
        this.p1HealthBar.setHealth(p1Hp);
        this.p2HealthBar.setHealth(p2Hp);
        this.p1HealthBar.setBurstMeter(p1Burst);
        this.p2HealthBar.setBurstMeter(p2Burst);
    }

    public updateRoundWinIndicators(p1Wins: number, p2Wins: number) {
        const indicatorY = 37;
        const indicatorSize = 10;
        const indicatorSpacing = 22;
        const { width } = this.scale;

        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            this.drawWinIndicator(this.p1WinIndicators[i], 185 + (i * indicatorSpacing), indicatorY, indicatorSize, i < p1Wins);
            this.drawWinIndicator(this.p2WinIndicators[i], width - 195 - (i * indicatorSpacing), indicatorY, indicatorSize, i < p2Wins);
        }
    }

    public startRoundSequence(currentRound: number) {
        const { width, height } = this.scale;
        const roundKey = `round${currentRound}`;

        const roundTitle = this.add.image(width / 2, height / 2, roundKey);
        const targetScale = Math.min((width * 0.6) / roundTitle.width, (height * 0.4) / roundTitle.height);

        roundTitle.setScale(targetScale * 0.8).setAlpha(0);

        this.tweens.add({
            targets: roundTitle,
            alpha: 1,
            scale: targetScale,
            duration: 200,
            ease: 'Power2'
        });

        this.time.delayedCall(1000, () => {
            this.tweens.add({
                targets: roundTitle,
                alpha: 0,
                scale: roundTitle.scale * 1.2,
                duration: 150,
                ease: 'Power2',
                onComplete: () => roundTitle.destroy()
            });

            const fightSplash = this.add.image(width / 2, height / 2, 'fightSplash');
            const fightTargetScale = Math.min((width * 0.5) / fightSplash.width, (height * 0.35) / fightSplash.height);

            fightSplash.setScale(fightTargetScale * 0.5).setAlpha(0);

            this.tweens.add({
                targets: fightSplash,
                alpha: 1,
                scale: fightTargetScale,
                duration: 150,
                ease: 'Back.easeOut'
            });

            this.time.delayedCall(750, () => {
                this.tweens.add({
                    targets: fightSplash,
                    alpha: 0,
                    scale: fightTargetScale * 1.5,
                    duration: 150,
                    ease: 'Power2',
                    onComplete: () => fightSplash.destroy()
                });
                const battleScene = this.scene.get('BattleScene');
                battleScene.events.emit('roundSequenceComplete');
            });
        });
    }

    public showRoundResult(text: string) {
        const { width, height } = this.scale;
        const resultText = this.add.text(width / 2, height / 2, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '40px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5);

        this.tweens.add({
            targets: resultText,
            y: height / 2 - 20,
            duration: 500,
            ease: 'Power2'
        });

        this.time.delayedCall(2000, () => {
            this.tweens.add({
                targets: resultText,
                alpha: 0,
                duration: 300,
                onComplete: () => resultText.destroy()
            });
        });
    }

    public showMatchOver(text: string, p1Wins: number, p2Wins: number) {
        const { width, height } = this.scale;
        this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

        this.add.text(width / 2, height / 2 - 80, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '48px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2, `${p1Wins} - ${p2Wins}`, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '36px',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5);

        const playAgainBtn = this.add.text(width / 2, height / 2 + 100, 'PLAY AGAIN', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        playAgainBtn.on('pointerdown', () => {
            const battleScene = this.scene.get('BattleScene');
            battleScene.events.emit('playAgain');
        });
        playAgainBtn.on('pointerover', () => playAgainBtn.setStyle({ fill: '#ff0' }));
        playAgainBtn.on('pointerout', () => playAgainBtn.setStyle({ fill: '#fff' }));

        const menuBtn = this.add.text(width / 2, height / 2 + 160, 'MAIN MENU', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '20px',
            color: '#aaaaaa',
            backgroundColor: '#222222',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        menuBtn.on('pointerdown', () => {
            const battleScene = this.scene.get('BattleScene');
            battleScene.events.emit('mainMenu');
        });
        menuBtn.on('pointerover', () => menuBtn.setStyle({ fill: '#ff0' }));
        menuBtn.on('pointerout', () => menuBtn.setStyle({ fill: '#aaa' }));
    }
}
