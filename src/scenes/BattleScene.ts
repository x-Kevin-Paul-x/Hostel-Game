import Phaser from 'phaser';
import { Fighter } from '../engine/Fighter';
import { InputManager } from '../engine/InputManager';
import { CombatSystem } from '../engine/CombatSystem';
import { AIController } from '../engine/AIController';
import { HealthBar } from '../ui/HealthBar';

export class BattleScene extends Phaser.Scene {
    private p1!: Fighter;
    private p2!: Fighter;
    private inputManager!: InputManager;
    private combatSystem!: CombatSystem;
    private aiController?: AIController;

    private p1HealthBar!: HealthBar;
    private p2HealthBar!: HealthBar;
    private timerText!: Phaser.GameObjects.Text;
    private roundTimer: number = 99;
    private timerEvent!: Phaser.Time.TimerEvent;

    private isVsAI: boolean = true; // Default to Vs AI for now
    private roundOver: boolean = false;

    constructor() {
        super('BattleScene');
    }

    create() {
        // Background
        const bg = this.add.image(640, 360, 'background');
        bg.setDisplaySize(1280, 720);

        // Create floor (Invisible physics barrier)
        // Lowered floor to bottom of screen (y=710, height=20 -> top=700)
        const floor = this.add.rectangle(640, 710, 1280, 20, 0x00ff00, 0.5);
        this.physics.add.existing(floor, true); // Static body

        // Visual Floor (TileSprite)
        // this.add.tileSprite(640, 700, 1280, 60, 'floor');

        // Create Animations for Kevin (hardcoded for now, should be dynamic based on manifest)
        const charName = 'Kevin';

        // Walk Animation
        const walkFrames = [];
        for (let i = 0; i < 49; i++) {
            walkFrames.push({ key: `${charName}_walk_${i}` });
        }

        this.anims.create({
            key: `${charName}_walk`,
            frames: walkFrames,
            frameRate: 24,
            repeat: -1
        });

        // Create Fighters
        this.p1 = new Fighter(this, 300, 300, `${charName}_idle`, true);
        this.p2 = new Fighter(this, 980, 300, `${charName}_idle`, false);

        this.p1.setScale(0.5);
        this.p2.setScale(0.5);

        // Colliders
        this.physics.add.collider(this.p1, floor);
        this.physics.add.collider(this.p2, floor);
        this.physics.add.collider(this.p1, this.p2);

        // Systems
        this.inputManager = new InputManager(this);
        this.combatSystem = new CombatSystem(this, [this.p1, this.p2]);

        if (this.isVsAI) {
            this.aiController = new AIController(this, this.p2, this.p1);
        }

        // UI
        this.createUI();

        // Timer
        this.roundTimer = 99;
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (this.roundOver) return;
                this.roundTimer--;
                this.timerText.setText(this.roundTimer.toString());
                if (this.roundTimer <= 0) {
                    this.handleTimeOut();
                }
            },
            loop: true
        });
    }

    update(time: number) {
        if (this.roundOver) return;

        const p1Input = this.inputManager.getP1Input();
        let p2Input;

        if (this.isVsAI && this.aiController) {
            p2Input = this.aiController.update(time);
        } else {
            p2Input = this.inputManager.getP2Input();
        }

        this.p1.update(p1Input);
        this.p2.update(p2Input);

        // Bounds Check
        if (this.p1.y > 800) {
            this.p1.setPosition(300, 300);
            this.p1.setVelocity(0, 0);
        }
        if (this.p2.y > 800) {
            this.p2.setPosition(980, 300);
            this.p2.setVelocity(0, 0);
        }

        this.combatSystem.update();

        this.updateUI();
        this.checkRoundEnd();
    }

    private createUI() {
        // Player 1 Name
        this.add.text(50, 50, 'Player 1', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#fff',
            stroke: '#000',
            strokeThickness: 4
        });

        // Player 2 Name
        this.add.text(1230, 50, 'Player 2', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#fff',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(1, 0);

        // Health Bars
        this.p1HealthBar = new HealthBar(this, 50, 80, 450, 30, 100, true);
        this.p2HealthBar = new HealthBar(this, 1230, 80, 450, 30, 100, false);

        // Timer
        this.timerText = this.add.text(640, 60, '99', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '60px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5);
    }

    private updateUI() {
        this.p1HealthBar.setHealth(this.p1.hp);
        this.p2HealthBar.setHealth(this.p2.hp);
    }

    private handleTimeOut() {
        this.roundOver = true;
        let winner = 'Draw';
        if (this.p1.hp > this.p2.hp) winner = 'Player 1 Wins!';
        else if (this.p2.hp > this.p1.hp) winner = 'Player 2 Wins!';

        this.showGameOver(winner);
    }

    private checkRoundEnd() {
        if (this.p1.currentState === 'KO' || this.p2.currentState === 'KO') {
            this.roundOver = true;
            const winner = this.p1.currentState === 'KO' ? 'Player 2 Wins!' : 'Player 1 Wins!';
            this.showGameOver(winner);
        }
    }

    private showGameOver(text: string) {
        // Game Over Text
        this.add.text(640, 300, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '60px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        // Play Again Button
        const playAgainBtn = this.add.text(640, 450, 'PLAY AGAIN', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.scene.restart();
                this.roundOver = false;
            })
            .on('pointerover', () => playAgainBtn.setStyle({ fill: '#ff0' }))
            .on('pointerout', () => playAgainBtn.setStyle({ fill: '#fff' }));
    }
}
