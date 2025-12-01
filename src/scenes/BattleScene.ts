import Phaser from 'phaser';
import { Fighter } from '../engine/Fighter';
import { InputManager } from '../engine/InputManager';
import { CombatSystem } from '../engine/CombatSystem';
import { AIController } from '../engine/AIController';
import { HealthBar } from '../ui/HealthBar';
import { SettingsManager } from '../utils/SettingsManager';

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
    
    private floor!: Phaser.GameObjects.Rectangle;
    private backgroundVideo!: Phaser.GameObjects.Video;
    private fightMusic!: Phaser.Sound.BaseSound;

    constructor() {
        super('BattleScene');
    }

    create() {
        const { width, height } = this.scale;
        
        // Background video - loops and fits screen properly
        this.backgroundVideo = this.add.video(width / 2, height / 2, 'backgroundVideo');
        this.backgroundVideo.setLoop(true);
        this.backgroundVideo.play(true); // muted for autoplay policy

        // Wait for the video to be ready, then scale it to fit the screen
        this.backgroundVideo.on('play', () => {
            const videoWidth = this.backgroundVideo.width;
            const videoHeight = this.backgroundVideo.height;
            // Use "contain" scaling: fit within bounds without cropping
            const scaleX = width / videoWidth;
            const scaleY = height / videoHeight;
            const scale = Math.min(scaleX, scaleY);
            this.backgroundVideo.setScale(scale);
        });
        // Fallback: set display size immediately (will adjust once video metadata loads)
        this.backgroundVideo.setDisplaySize(width, height);

        // Fight Music - respect saved fight music settings
        const settings = SettingsManager.getInstance();

        // Stop title music if it's playing
        const titleMusic = this.sound.get('bgMusic');
        if (titleMusic && titleMusic.isPlaying) {
            titleMusic.stop();
        }

        const existingFightMusic = this.sound.get('fightMusic');
        if (existingFightMusic) {
            this.fightMusic = existingFightMusic;
        } else {
            this.fightMusic = this.sound.add('fightMusic', {
                loop: true,
                volume: settings.get('fightMusicVolume')
            });
        }
        if (settings.get('fightMusicEnabled')) {
            (this.fightMusic as Phaser.Sound.WebAudioSound).setVolume(settings.get('fightMusicVolume'));
            if (!this.fightMusic.isPlaying) {
                this.fightMusic.play();
            }
        }

        // Create invisible floor (physics barrier at bottom)
        // Adjust the Y position to match where the floor appears in your background image
        const floorY = height - 50; // Adjust this value to match your background's floor level
        this.floor = this.add.rectangle(width / 2, floorY, width, 20, 0x00ff00, 0);
        this.physics.add.existing(this.floor, true); // Static body

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
        
        // Create animation from specific frame range
        const makeAnimFromRange = (char: string, anim: string, baseAnim: string, startFrame: number, endFrame: number, frameRate = 24, repeat = -1) => {
            const frames: any[] = [];
            for (let i = startFrame; i <= endFrame; i++) {
                if (this.textures.exists(`${char}_${baseAnim}_${i}`)) {
                    frames.push({ key: `${char}_${baseAnim}_${i}` });
                }
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

                // Duck animation (play once, hold last frame)
                makeAnim(name, 'duck', 48, 0);

                // Jump animations - split into 3 phases
                // Jump Start (rising): frames 0-7
                makeAnimFromRange(name, 'jump_start', 'jump', 0, 7, 48, 0);
                // Jump Air (airborne): frames 8-21, loop
                makeAnimFromRange(name, 'jump_air', 'jump', 8, 21, 18, -1);
                // Jump Land (landing): frames 22-34
                makeAnimFromRange(name, 'jump_land', 'jump', 22, 34, 48, 0);

                // Block animation (play once, hold last frame)
                makeAnim(name, 'block', 48, 0);
            });
        } else {
            // Fallback for Kevin only (older project state)
            const charName = 'Kevin';
            makeAnim(charName, 'walk', 24, -1);
            makeAnim(charName, 'idle', 12, -1);
            makeAnim(charName, 'jab', defaultJabFrameRate, 0);
            makeAnim(charName, 'duck', 48, 0);
            
            // Jump animations - split into 3 phases
            makeAnimFromRange(charName, 'jump_start', 'jump', 0, 7, 48, 0);
            makeAnimFromRange(charName, 'jump_air', 'jump', 8, 21, 18, -1);
            makeAnimFromRange(charName, 'jump_land', 'jump', 22, 34, 48, 0);
            
            makeAnim(charName, 'block', 48, 0);
        }

        // Create Fighters (default character name fallback)
        const p1CharName = (manifest && manifest.characters && manifest.characters.length > 0) ? manifest.characters[0].name : 'Kevin';
        let p2CharName = p1CharName;

        // Prefer Noel for player 2 when available; otherwise use second manifest entry if present
        if (manifest && manifest.characters) {
            const noelEntry = manifest.characters.find((c: any) => c.name === 'Noel');
            if (noelEntry) {
                p2CharName = 'Noel';
            } else if (manifest.characters.length > 1) {
                p2CharName = manifest.characters[1].name;
            }
        }

        const getInitialTexture = (charNameParam: string) => {
            let tex = `${charNameParam}_idle`;
            if (manifest && manifest.characters) {
                const charEntry = manifest.characters.find((c: any) => c.name === charNameParam);
                if (charEntry) {
                    if (charEntry.idleFrames && charEntry.idleFrames.length > 0) {
                        tex = `${charNameParam}_idle_0`;
                    } else if (charEntry.idleFrame) {
                        tex = `${charNameParam}_idle`;
                    }
                }
            }
            return tex;
        };

        // Spawn fighters relative to screen size
        const spawnY = height - 150; // Spawn above the floor
        const p1InitialTexture = getInitialTexture(p1CharName);
        const p2InitialTexture = getInitialTexture(p2CharName);

        this.p1 = new Fighter(this, width * 0.25, spawnY, p1InitialTexture, true);
        this.p2 = new Fighter(this, width * 0.75, spawnY, p2InitialTexture, false);

        // Base visual scale for fighters
        const baseScale = 0.5;
        // Noel should be 1.23x larger than other characters
        const noelScaleMultiplier = 1.23;

        const p1Scale = p1CharName === 'Noel' ? baseScale * noelScaleMultiplier : baseScale;
        const p2Scale = p2CharName === 'Noel' ? baseScale * noelScaleMultiplier : baseScale;

        this.p1.setScale(p1Scale);
        this.p2.setScale(p2Scale);
        
        // Initialize hitboxes after scaling
        this.p1.initializeHitbox();
        this.p2.initializeHitbox();

        // Colliders
        this.physics.add.collider(this.p1, this.floor);
        this.physics.add.collider(this.p2, this.floor);
        this.physics.add.collider(this.p1, this.p2);

        // Systems
        this.inputManager = new InputManager(this);
        this.combatSystem = new CombatSystem(this, [this.p1, this.p2]);

        if (this.isVsAI) {
            this.aiController = new AIController(this.p2, this.p1);
        }

        // UI
        this.createUI();
        this.createSettingsButton();

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

        this.p1.update(p1Input, time);
        this.p2.update(p2Input, time);

        // Bounds Check - reset if player falls off screen
        const { width, height } = this.scale;
        const spawnY = height - 150;
        
        if (this.p1.y > height + 100) {
            this.p1.setPosition(width * 0.25, spawnY);
            this.p1.setVelocity(0, 0);
        }
        if (this.p2.y > height + 100) {
            this.p2.setPosition(width * 0.75, spawnY);
            this.p2.setVelocity(0, 0);
        }
        
        // Keep players within screen bounds horizontally
        if (this.p1.x < 50) this.p1.x = 50;
        if (this.p1.x > width - 50) this.p1.x = width - 50;
        if (this.p2.x < 50) this.p2.x = 50;
        if (this.p2.x > width - 50) this.p2.x = width - 50;

        this.combatSystem.update(time);

        this.updateUI();
        this.checkRoundEnd();
    }

    private createUI() {
        const { width } = this.scale;
        
        // Create retro UI panel at top
        this.createRetroTopPanel(width);
        
        // Player 1 Name with retro styling
        const p1NameBg = this.add.graphics();
        p1NameBg.fillStyle(0x1a1a2e);
        p1NameBg.fillRoundedRect(30, 20, 180, 35, 4);
        p1NameBg.lineStyle(2, 0xffcc00);
        p1NameBg.strokeRoundedRect(30, 20, 180, 35, 4);
        
        this.add.text(120, 37, 'PLAYER 1', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Player 2 Name with retro styling
        const p2NameBg = this.add.graphics();
        p2NameBg.fillStyle(0x1a1a2e);
        p2NameBg.fillRoundedRect(width - 210, 20, 180, 35, 4);
        p2NameBg.lineStyle(2, 0xffcc00);
        p2NameBg.strokeRoundedRect(width - 210, 20, 180, 35, 4);
        
        this.add.text(width - 120, 37, 'PLAYER 2', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Health Bars - responsive width with more height for retro look
        const healthBarWidth = Math.min(400, (width - 250) / 2);
        this.p1HealthBar = new HealthBar(this, 50, 60, healthBarWidth, 35, 100, true);
        this.p2HealthBar = new HealthBar(this, width - 50, 60, healthBarWidth, 35, 100, false);

        // Retro Timer in center
        this.createRetroTimer(width);
    }
    
    private createRetroTopPanel(width: number) {
        const graphics = this.add.graphics();
        
        // Center decorative frame for timer
        const centerX = width / 2;
        const frameWidth = 120;
        const frameHeight = 80;
        
        // Outer dark frame
        graphics.fillStyle(0x1a1a2e);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth/2 - 15, 0);
        graphics.lineTo(centerX + frameWidth/2 + 15, 0);
        graphics.lineTo(centerX + frameWidth/2, frameHeight);
        graphics.lineTo(centerX - frameWidth/2, frameHeight);
        graphics.closePath();
        graphics.fillPath();
        
        // Border
        graphics.lineStyle(3, 0xffcc00);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth/2, frameHeight);
        graphics.lineTo(centerX - frameWidth/2 - 15, 0);
        graphics.moveTo(centerX + frameWidth/2, frameHeight);
        graphics.lineTo(centerX + frameWidth/2 + 15, 0);
        graphics.lineTo(centerX - frameWidth/2 - 15, 0);
        graphics.strokePath();
        
        // Bottom border
        graphics.lineStyle(3, 0x6a6a8a);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth/2, frameHeight);
        graphics.lineTo(centerX + frameWidth/2, frameHeight);
        graphics.strokePath();
        
        // Corner decorations
        graphics.fillStyle(0xffcc00);
        graphics.fillRect(centerX - frameWidth/2 - 10, 5, 6, 6);
        graphics.fillRect(centerX + frameWidth/2 + 4, 5, 6, 6);
        
        // "VS" text above timer
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
        
        // Timer background
        const timerBg = this.add.graphics();
        timerBg.fillStyle(0x0d0d1a);
        timerBg.fillRoundedRect(centerX - 40, 28, 80, 45, 6);
        timerBg.lineStyle(2, 0x4a4a6a);
        timerBg.strokeRoundedRect(centerX - 40, 28, 80, 45, 6);
        
        // Timer text with glow effect
        this.timerText = this.add.text(centerX, 50, '99', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '32px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: {
                offsetX: 0,
                offsetY: 0,
                color: '#ffcc00',
                blur: 8,
                fill: true
            }
        }).setOrigin(0.5);
        
        // "TIME" label
        this.add.text(centerX, 78, 'TIME', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: '#6a6a8a'
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

    private createSettingsButton() {
        const { width } = this.scale;
        // Gear icon button in top-right corner
        const btnSize = 40;
        const padding = 20;
        const btnX = width - btnSize / 2 - padding;
        const btnY = btnSize / 2 + padding + 60; // below health bar area

        const btnBg = this.add.rectangle(btnX, btnY, btnSize, btnSize, 0x1a1a2e);
        btnBg.setStrokeStyle(2, 0xffcc00);
        btnBg.setInteractive({ useHandCursor: true });

        this.add.text(btnX, btnY, '⚙', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#ffcc00'
        }).setOrigin(0.5);

        btnBg.on('pointerover', () => {
            btnBg.setFillStyle(0x2a2a4a);
        });
        btnBg.on('pointerout', () => {
            btnBg.setFillStyle(0x1a1a2e);
        });
        btnBg.on('pointerdown', () => {
            // Pause fight scene and open settings
            this.scene.pause();
            // Pause fight music while in settings
            if (this.fightMusic && this.fightMusic.isPlaying) {
                this.fightMusic.pause();
            }
            this.scene.launch('SettingsScene', { calledFrom: 'BattleScene' });
        });

        // Listen for resume to restart fight music if enabled
        this.events.on('resume', () => {
            const settings = SettingsManager.getInstance();
            if (settings.get('fightMusicEnabled') && this.fightMusic && !this.fightMusic.isPlaying) {
                (this.fightMusic as Phaser.Sound.WebAudioSound).setVolume(settings.get('fightMusicVolume'));
                this.fightMusic.play();
            }
        });
    }

    private showGameOver(text: string) {
        const { width, height } = this.scale;
        
        // Game Over Text
        this.add.text(width / 2, height / 2 - 50, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '60px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5);

        // Play Again Button
        const playAgainBtn = this.add.text(width / 2, height / 2 + 100, 'PLAY AGAIN', {
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
