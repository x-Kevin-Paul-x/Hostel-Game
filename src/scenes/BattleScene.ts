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

    private isVsAI: boolean = false; // Default to local 2-player (AI off)
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

        // Create Animations dynamically from loaded texture keys and manifest settings
        const defaultJabFrameRate = 72; // double the previous 36 -> faster jab by default

        const manifest = this.registry.get('character-manifest') || null;

        const makeAnim = (char: string, anim: string, frameRate = 24, repeat = -1) => {
            const frames: any[] = [];
            let i = 0;
            while (this.textures.exists(`${char}_${anim}_${i}`)) {
                frames.push({ key: `${char}_${anim}_${i}` });
                i++;
            }
            if (frames.length > 0) {
                this.anims.create({ key: `${char}_${anim}`, frames, frameRate, repeat });
            }
        };

        // If we have a manifest, create animations per character and honor per-character jabFrameRate
        if (manifest && manifest.characters) {
            manifest.characters.forEach((char: any) => {
                const name = char.name;
                // Walk (if frames exist)
                makeAnim(name, 'walk', 24, -1);

                // Idle (if frames exist)
                makeAnim(name, 'idle', 12, -1);

                // Jab: use per-character jabFrameRate if provided, else default
                const jabRate = char.jabFrameRate ? Number(char.jabFrameRate) : defaultJabFrameRate;
                makeAnim(name, 'jab', jabRate, 0);
            });
        } else {
            // Fallback for Kevin only (older project state)
            const charName = 'Kevin';
            makeAnim(charName, 'walk', 24, -1);
            makeAnim(charName, 'idle', 12, -1);
            makeAnim(charName, 'jab', defaultJabFrameRate, 0);
        }

        // Create Fighters (default character name fallback)
        const charName = (manifest && manifest.characters && manifest.characters.length > 0) ? manifest.characters[0].name : 'Kevin';

        // Determine initial texture key for idle: prefer first idle frame, then single idleFrame key
        let initialTexture = `${charName}_idle`;
        if (manifest && manifest.characters) {
            const charEntry = manifest.characters.find((c: any) => c.name === charName);
            if (charEntry) {
                if (charEntry.idleFrames && charEntry.idleFrames.length > 0) {
                    initialTexture = `${charName}_idle_0`;
                } else if (charEntry.idleFrame) {
                    initialTexture = `${charName}_idle`;
                }
            }
        }

        this.p1 = new Fighter(this, 300, 300, initialTexture, true);
        this.p2 = new Fighter(this, 980, 300, initialTexture, false);

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
            this.aiController = new AIController(this.p2, this.p1);
        }

        // UI
        this.createUI();

        // Timer
        this.roundTimer = 99;
        this.time.addEvent({
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
