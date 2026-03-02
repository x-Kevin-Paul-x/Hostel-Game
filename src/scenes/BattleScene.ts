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
    private inputFrozen: boolean = false; // Freeze input during round start sequence

    // Best of 3 Round System (1V1 Mode only)
    private gameMode: '1v1' | 'story' = '1v1'; // Current game mode
    private currentRound: number = 1;
    private p1RoundWins: number = 0;
    private p2RoundWins: number = 0;
    private readonly ROUNDS_TO_WIN: number = 2;
    private readonly MAX_ROUNDS: number = 3;

    // Round win indicators (UI elements)
    private p1WinIndicators: Phaser.GameObjects.Graphics[] = [];
    private p2WinIndicators: Phaser.GameObjects.Graphics[] = [];

    private floor!: Phaser.GameObjects.Rectangle;
    private backgroundVideo!: Phaser.GameObjects.Video;
    private fightMusic!: Phaser.Sound.BaseSound;

    // Starting positions for reset
    private p1StartX!: number;
    private p1StartY!: number;
    private p2StartX!: number;
    private p2StartY!: number;

    // Character names for UI display
    private p1CharName: string = 'P1';
    private p2CharName: string = 'P2';

    constructor() {
        super('BattleScene');
    }

    init(data: { p1Character?: string; p2Character?: string; isVsAI?: boolean }) {
        // Accept character selections from CharacterSelectScene via BootScene
        if (data?.p1Character) {
            this.p1CharName = data.p1Character;
        }
        if (data?.p2Character) {
            this.p2CharName = data.p2Character;
        }
        if (data?.isVsAI !== undefined) {
            this.isVsAI = data.isVsAI;
        }
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
        const defaultJabFrameRate = 60; // double the previous 36 -> faster jab by default

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
                // Create animations from manifest settings
                if (char.frameRates) {
                    const fr = char.frameRates;
                    const jumpRate = fr.jump || 48;
                    const airRate = Math.floor(jumpRate * 0.375);

                    // Generic animations
                    makeAnim(name, 'idle', fr.idle || 20, -1);
                    makeAnim(name, 'jab', fr.jab || 60, 0);
                    makeAnim(name, 'block', fr.block || 48, 0);

                    if (name === 'Noel') {
                        // Noel specific walk: transition (0-2) then loop (3-18)
                        makeAnimFromRange(name, 'walk_start', 'walk', 0, 2, fr.walk || 24, 0);
                        makeAnimFromRange(name, 'walk', 'walk', 3, 18, fr.walk || 24, -1);

                        // Noel specific duck: start(0-7), loop(8-15), end(16-etc)
                        makeAnimFromRange(name, 'duck_start', 'duck', 0, 7, fr.duck || 48, 0);
                        makeAnimFromRange(name, 'duck', 'duck', 8, 15, fr.duck || 48, -1);
                        const duckEndFrame = char.duckFrames ? char.duckFrames.length - 1 : 0;
                        if (duckEndFrame >= 16) {
                            makeAnimFromRange(name, 'duck_end', 'duck', 16, duckEndFrame, fr.duck || 48, 0);
                        }

                        makeAnimFromRange(name, 'jump_start', 'jump', 0, 9, jumpRate, 0);
                        makeAnimFromRange(name, 'jump_air', 'jump', 10, 16, airRate, -1);
                        makeAnimFromRange(name, 'jump_land', 'jump', 17, 19, jumpRate, 0);
                    } else {
                        makeAnim(name, 'walk', fr.walk || 24, -1);
                        makeAnim(name, 'duck', fr.duck || 48, 0);

                        makeAnimFromRange(name, 'jump_start', 'jump', 0, 7, jumpRate, 0);
                        makeAnimFromRange(name, 'jump_air', 'jump', 8, 21, airRate, -1);
                        makeAnimFromRange(name, 'jump_land', 'jump', 22, 34, jumpRate, 0);
                    }
                } else {
                    // Fallback to defaults
                    makeAnim(name, 'walk', 24, -1);
                    makeAnim(name, 'idle', 20, -1);
                    makeAnim(name, 'jab', defaultJabFrameRate, 0);
                    makeAnim(name, 'duck', 48, 0);
                    makeAnim(name, 'block', 48, 0);

                    if (name === 'Noel') {
                        makeAnimFromRange(name, 'jump_start', 'jump', 0, 9, 48, 0);
                        makeAnimFromRange(name, 'jump_air', 'jump', 10, 16, 18, -1);
                        makeAnimFromRange(name, 'jump_land', 'jump', 17, 19, 48, 0);
                    } else {
                        makeAnimFromRange(name, 'jump_start', 'jump', 0, 7, 48, 0);
                        makeAnimFromRange(name, 'jump_air', 'jump', 8, 21, 18, -1);
                        makeAnimFromRange(name, 'jump_land', 'jump', 22, 34, 48, 0);
                    }
                }

                // Special handling for Noel's two-part jab chain (uses jabRate)
                if (name === 'Noel') {
                    const jabRate = char.frameRates?.jab || 60;
                    makeAnimFromRange(name, 'jab_1', 'jab', 0, 7, jabRate, 0);
                    makeAnimFromRange(name, 'jab_2', 'jab', 8, 15, jabRate, 0);
                }
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

        // Only set character names from manifest if they weren't passed from CharacterSelectScene
        // manifest is already declared above at line 123

        if (!this.p1CharName || this.p1CharName === 'P1') {
            this.p1CharName = (manifest && manifest.characters && manifest.characters.length > 0) ? manifest.characters[0].name : 'Kevin';
        }
        if (!this.p2CharName || this.p2CharName === 'P2') {
            this.p2CharName = (manifest && manifest.characters && manifest.characters.length > 1) ? manifest.characters[1].name : 'Noel';
        }

        console.log(`Starting battle: ${this.p1CharName} vs ${this.p2CharName}`);


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
        const p1InitialTexture = getInitialTexture(this.p1CharName);
        const p2InitialTexture = getInitialTexture(this.p2CharName);

        this.p1 = new Fighter(this, width * 0.25, spawnY, p1InitialTexture, true);
        this.p2 = new Fighter(this, width * 0.75, spawnY, p2InitialTexture, false);

        // Store starting positions for round resets
        this.p1StartX = width * 0.25;
        this.p1StartY = spawnY;
        this.p2StartX = width * 0.75;
        this.p2StartY = spawnY;

        // Base visual scale for fighters
        const baseScale = 0.5;
        // Noel should be 1.23x larger than other characters
        const noelScaleMultiplier = 1.23;

        const p1Scale = this.p1CharName === 'Noel' ? baseScale * noelScaleMultiplier : baseScale;
        const p2Scale = this.p2CharName === 'Noel' ? baseScale * noelScaleMultiplier : baseScale;

        this.p1.setScale(p1Scale);
        this.p2.setScale(p2Scale);

        // Initialize hitboxes after scaling
        this.p1.initializeHitbox();
        this.p2.initializeHitbox();

        // Colliders
        this.physics.add.collider(this.p1, this.floor);
        this.physics.add.collider(this.p2, this.floor);

        // Fighter vs Fighter collision with custom handling
        this.physics.add.collider(this.p1, this.p2, undefined, (p1Obj, p2Obj) => {
            const p1Fighter = p1Obj as Fighter;
            const p2Fighter = p2Obj as Fighter;
            const p1Body = p1Fighter.body as Phaser.Physics.Arcade.Body;
            const p2Body = p2Fighter.body as Phaser.Physics.Arcade.Body;

            // Prevent standing on top of each other - check if one is above the other
            const p1Bottom = p1Body.y + p1Body.height;
            const p2Bottom = p2Body.y + p2Body.height;
            const p1Top = p1Body.y;
            const p2Top = p2Body.y;

            // If one fighter is mostly above the other, apply slip-off force
            if (p1Bottom < p2Top + 20 || p2Bottom < p1Top + 20) {
                // Someone is on top - push them off horizontally
                if (p1Fighter.y < p2Fighter.y) {
                    // P1 is on top of P2 - slip P1 off
                    const slipDir = p1Fighter.x < p2Fighter.x ? -200 : 200;
                    p1Fighter.setVelocityX(slipDir);
                } else {
                    // P2 is on top of P1 - slip P2 off
                    const slipDir = p2Fighter.x < p1Fighter.x ? -200 : 200;
                    p2Fighter.setVelocityX(slipDir);
                }
                return false; // Don't collide normally when stacked
            }

            // Prevent overlapping near walls by pushing apart
            // Variable declarations removed as they are no longer used

            // Smart Wall Collision: Prevent overlapping when cornered
            // If one player is against the wall, they act as a solid object
            const dist = Math.abs(p1Fighter.x - p2Fighter.x);
            const combinedHalfWidths = (p1Body.width / 2) + (p2Body.width / 2);

            if (dist < combinedHalfWidths) {
                const overlapAmount = combinedHalfWidths - dist;
                const p1NearWall = p1Fighter.x < 70 || p1Fighter.x > width - 70;
                const p2NearWall = p2Fighter.x < 70 || p2Fighter.x > width - 70;

                if (p1NearWall && !p2NearWall) {
                    // P1 is cornered, P2 is pushing -> Move P2 back
                    if (p1Fighter.x < p2Fighter.x) p2Fighter.x += overlapAmount;
                    else p2Fighter.x -= overlapAmount;
                    p2Fighter.setVelocityX(0); // Stop P2's momentum
                }
                else if (p2NearWall && !p1NearWall) {
                    // P2 is cornered, P1 is pushing -> Move P1 back
                    if (p2Fighter.x < p1Fighter.x) p1Fighter.x += overlapAmount;
                    else p1Fighter.x -= overlapAmount;
                    p1Fighter.setVelocityX(0); // Stop P1's momentum
                }
                else if (overlapAmount > 5) {
                    // Mid-screen overlap correction (prevents merging)
                    // Split the difference so it doesn't feel like "pushing"
                    const correction = overlapAmount / 2;
                    if (p1Fighter.x < p2Fighter.x) {
                        p1Fighter.x -= correction;
                        p2Fighter.x += correction;
                    } else {
                        p1Fighter.x += correction;
                        p2Fighter.x -= correction;
                    }
                }
            }

            return true; // Allow normal collision
        }, this);

        // Systems
        this.inputManager = new InputManager(this);
        this.combatSystem = new CombatSystem(this, [this.p1, this.p2]);

        if (this.isVsAI) {
            this.aiController = new AIController(this.p2, this.p1);
        }

        // UI
        this.createUI();
        this.createSettingsButton();
        this.createRoundWinIndicators();

        // Timer
        this.roundTimer = 99;
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (this.roundOver || this.inputFrozen) return;
                this.roundTimer--;
                this.timerText.setText(this.roundTimer.toString());
                if (this.roundTimer <= 0) {
                    this.handleTimeOut();
                }
            },
            loop: true
        });

        // Start round sequence for 1v1 mode
        if (this.gameMode === '1v1') {
            this.startRoundSequence();
        }
    }

    update(time: number) {
        if (this.roundOver || this.inputFrozen) return;

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

        // Player 1 Name with character name and retro styling
        const p1NameBg = this.add.graphics();
        p1NameBg.fillStyle(0x1a1a2e);
        p1NameBg.fillRoundedRect(30, 20, 140, 35, 4);
        p1NameBg.lineStyle(2, 0xffcc00);
        p1NameBg.strokeRoundedRect(30, 20, 140, 35, 4);

        // Use character name (uppercase, max 8 chars for display)
        const p1DisplayName = this.p1CharName.toUpperCase().substring(0, 8);
        this.add.text(100, 37, p1DisplayName, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Player 2 Name with character name and retro styling
        const p2NameBg = this.add.graphics();
        p2NameBg.fillStyle(0x1a1a2e);
        p2NameBg.fillRoundedRect(width - 170, 20, 140, 35, 4);
        p2NameBg.lineStyle(2, 0xffcc00);
        p2NameBg.strokeRoundedRect(width - 170, 20, 140, 35, 4);

        const p2DisplayName = this.p2CharName.toUpperCase().substring(0, 8);
        this.add.text(width - 100, 37, p2DisplayName, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
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
        graphics.moveTo(centerX - frameWidth / 2 - 15, 0);
        graphics.lineTo(centerX + frameWidth / 2 + 15, 0);
        graphics.lineTo(centerX + frameWidth / 2, frameHeight);
        graphics.lineTo(centerX - frameWidth / 2, frameHeight);
        graphics.closePath();
        graphics.fillPath();

        // Border
        graphics.lineStyle(3, 0xffcc00);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth / 2, frameHeight);
        graphics.lineTo(centerX - frameWidth / 2 - 15, 0);
        graphics.moveTo(centerX + frameWidth / 2, frameHeight);
        graphics.lineTo(centerX + frameWidth / 2 + 15, 0);
        graphics.lineTo(centerX - frameWidth / 2 - 15, 0);
        graphics.strokePath();

        // Bottom border
        graphics.lineStyle(3, 0x6a6a8a);
        graphics.beginPath();
        graphics.moveTo(centerX - frameWidth / 2, frameHeight);
        graphics.lineTo(centerX + frameWidth / 2, frameHeight);
        graphics.strokePath();

        // Corner decorations
        graphics.fillStyle(0xffcc00);
        graphics.fillRect(centerX - frameWidth / 2 - 10, 5, 6, 6);
        graphics.fillRect(centerX + frameWidth / 2 + 4, 5, 6, 6);

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

        // Update burst meters
        this.p1HealthBar.setBurstMeter(this.p1.burstMeter);
        this.p2HealthBar.setBurstMeter(this.p2.burstMeter);
    }

    private handleTimeOut() {
        this.roundOver = true;

        let roundWinner: 'p1' | 'p2' | 'draw' = 'draw';
        if (this.p1.hp > this.p2.hp) {
            roundWinner = 'p1';
        } else if (this.p2.hp > this.p1.hp) {
            roundWinner = 'p2';
        }

        if (this.gameMode === '1v1') {
            // Best of 3 system
            if (roundWinner === 'p1') {
                this.p1RoundWins++;
                this.updateRoundWinIndicators();
                this.showRoundResult('Player 1 Wins Round!');
            } else if (roundWinner === 'p2') {
                this.p2RoundWins++;
                this.updateRoundWinIndicators();
                this.showRoundResult('Player 2 Wins Round!');
            } else {
                // Draw - no one wins the round, proceed to next round
                this.showRoundResult('Draw!');
            }

            // Check if match is over
            if (this.p1RoundWins >= this.ROUNDS_TO_WIN) {
                this.time.delayedCall(2000, () => {
                    this.showMatchOver('Player 1 Wins the Match!');
                });
            } else if (this.p2RoundWins >= this.ROUNDS_TO_WIN) {
                this.time.delayedCall(2000, () => {
                    this.showMatchOver('Player 2 Wins the Match!');
                });
            } else if (this.currentRound < this.MAX_ROUNDS) {
                // Start next round
                this.currentRound++;
                this.time.delayedCall(2500, () => {
                    this.resetForNextRound();
                });
            } else {
                // Max rounds reached, determine winner by total round wins
                if (this.p1RoundWins > this.p2RoundWins) {
                    this.time.delayedCall(2000, () => {
                        this.showMatchOver('Player 1 Wins the Match!');
                    });
                } else if (this.p2RoundWins > this.p1RoundWins) {
                    this.time.delayedCall(2000, () => {
                        this.showMatchOver('Player 2 Wins the Match!');
                    });
                } else {
                    this.time.delayedCall(2000, () => {
                        this.showMatchOver('Match Draw!');
                    });
                }
            }
        } else {
            // Original behavior for non-1v1 modes
            let winner = 'Draw';
            if (roundWinner === 'p1') winner = 'Player 1 Wins!';
            else if (roundWinner === 'p2') winner = 'Player 2 Wins!';
            this.showGameOver(winner);
        }
    }

    private checkRoundEnd() {
        if (this.p1.currentState === 'KO' || this.p2.currentState === 'KO') {
            this.roundOver = true;

            if (this.gameMode === '1v1') {
                // Best of 3 system
                if (this.p1.currentState === 'KO') {
                    this.p2RoundWins++;
                    this.updateRoundWinIndicators();
                    this.showRoundResult('Player 2 Wins Round!');
                } else {
                    this.p1RoundWins++;
                    this.updateRoundWinIndicators();
                    this.showRoundResult('Player 1 Wins Round!');
                }

                // Check if match is over (first to 2 wins)
                if (this.p1RoundWins >= this.ROUNDS_TO_WIN) {
                    this.time.delayedCall(2000, () => {
                        this.showMatchOver('Player 1 Wins the Match!');
                    });
                } else if (this.p2RoundWins >= this.ROUNDS_TO_WIN) {
                    this.time.delayedCall(2000, () => {
                        this.showMatchOver('Player 2 Wins the Match!');
                    });
                } else {
                    // Start next round after delay
                    this.currentRound++;
                    this.time.delayedCall(2500, () => {
                        this.resetForNextRound();
                    });
                }
            } else {
                // Non-1v1 mode - original behavior
                const winner = this.p1.currentState === 'KO' ? 'Player 2 Wins!' : 'Player 1 Wins!';
                this.showGameOver(winner);
            }
        }
    }

    private createSettingsButton() {
        const { width } = this.scale;
        // Gear icon button in top-right corner
        const btnSize = 40;
        const padding = 20;
        const btnX = width - btnSize / 2 - padding;
        const btnY = btnSize / 2 + padding + 100; // below health bar area

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
                this.resetMatchState();
                this.scene.restart();
            })
            .on('pointerover', () => playAgainBtn.setStyle({ fill: '#ff0' }))
            .on('pointerout', () => playAgainBtn.setStyle({ fill: '#fff' }));
    }

    // ========== BEST OF 3 ROUND SYSTEM METHODS ==========

    /**
     * Creates the round win indicator squares adjacent to character names
     */
    private createRoundWinIndicators() {
        const { width } = this.scale;
        const indicatorY = 37; // Same Y as character name text
        const indicatorSize = 10;
        const indicatorSpacing = 22;

        // P1 indicators (right of character name label, at x = 175+)
        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.add.graphics();
            const x = 185 + (i * indicatorSpacing);

            // Draw retro-styled square indicator (matching panel aesthetic)
            indicator.fillStyle(0x0d0d1a);
            indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            indicator.lineStyle(2, 0xffcc00);
            indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);

            this.p1WinIndicators.push(indicator);
        }

        // P2 indicators (left of character name label - moved further for spacing)
        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.add.graphics();
            const x = width - 195 - (i * indicatorSpacing);

            // Draw retro-styled square indicator
            indicator.fillStyle(0x0d0d1a);
            indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            indicator.lineStyle(2, 0xffcc00);
            indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);

            this.p2WinIndicators.push(indicator);
        }
    }

    /**
     * Updates the win indicators to show current round wins
     */
    private updateRoundWinIndicators() {
        const indicatorY = 37; // Same Y as character name text
        const indicatorSize = 10;
        const indicatorSpacing = 22;
        const { width } = this.scale;

        // Update P1 indicators
        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.p1WinIndicators[i];
            const x = 185 + (i * indicatorSpacing);
            indicator.clear();

            if (i < this.p1RoundWins) {
                // Filled (won) - bright green with glow effect
                indicator.fillStyle(0x00dd00);
                indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
                indicator.lineStyle(2, 0x00ff00);
                indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            } else {
                // Empty (not won) - retro styled
                indicator.fillStyle(0x0d0d1a);
                indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
                indicator.lineStyle(2, 0xffcc00);
                indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            }
        }

        // Update P2 indicators
        for (let i = 0; i < this.ROUNDS_TO_WIN; i++) {
            const indicator = this.p2WinIndicators[i];
            const x = width - 195 - (i * indicatorSpacing);
            indicator.clear();

            if (i < this.p2RoundWins) {
                // Filled (won) - bright green with glow effect
                indicator.fillStyle(0x00dd00);
                indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
                indicator.lineStyle(2, 0x00ff00);
                indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            } else {
                // Empty (not won) - retro styled
                indicator.fillStyle(0x0d0d1a);
                indicator.fillRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
                indicator.lineStyle(2, 0xffcc00);
                indicator.strokeRoundedRect(x - indicatorSize / 2, indicatorY - indicatorSize / 2, indicatorSize, indicatorSize, 2);
            }
        }
    }

    /**
     * Executes the round start sequence:
     * 1. Freeze input
     * 2. Show round title for 1 second
     * 3. Show FIGHT splash for 0.75 seconds
     * 4. Unfreeze and start round
     */
    private startRoundSequence() {
        const { width, height } = this.scale;

        // Freeze all input
        this.inputFrozen = true;
        this.roundOver = false;

        // Get the appropriate round title asset
        const roundKey = `round${this.currentRound}`;

        // Create round title image centered on screen
        const roundTitle = this.add.image(width / 2, height / 2, roundKey);
        roundTitle.setDepth(1000);

        // Scale to fit screen properly (max 60% of screen width or 40% of height)
        const maxWidth = width * 0.6;
        const maxHeight = height * 0.4;
        const scaleX = maxWidth / roundTitle.width;
        const scaleY = maxHeight / roundTitle.height;
        const targetScale = Math.min(scaleX, scaleY);

        roundTitle.setScale(targetScale * 0.8);
        roundTitle.setAlpha(0);

        // Fade in the round title
        this.tweens.add({
            targets: roundTitle,
            alpha: 1,
            scale: targetScale,
            duration: 200,
            ease: 'Power2'
        });

        // After 1 second, hide round title and show FIGHT
        this.time.delayedCall(1000, () => {
            // Store the current scale for fade out
            const currentScale = roundTitle.scale;

            // Fade out round title
            this.tweens.add({
                targets: roundTitle,
                alpha: 0,
                scale: currentScale * 1.2,
                duration: 150,
                ease: 'Power2',
                onComplete: () => {
                    roundTitle.destroy();
                }
            });

            // Show FIGHT splash
            const fightSplash = this.add.image(width / 2, height / 2, 'fightSplash');
            fightSplash.setDepth(1000);

            // Scale FIGHT splash to fit screen properly (max 50% of screen width or 35% of height)
            const fightMaxWidth = width * 0.5;
            const fightMaxHeight = height * 0.35;
            const fightScaleX = fightMaxWidth / fightSplash.width;
            const fightScaleY = fightMaxHeight / fightSplash.height;
            const fightTargetScale = Math.min(fightScaleX, fightScaleY);

            fightSplash.setScale(fightTargetScale * 0.5);
            fightSplash.setAlpha(0);

            // Animate FIGHT splash in
            this.tweens.add({
                targets: fightSplash,
                alpha: 1,
                scale: fightTargetScale,
                duration: 150,
                ease: 'Back.easeOut'
            });

            // After 0.75 seconds, remove FIGHT and start round
            this.time.delayedCall(750, () => {
                // Fade out FIGHT
                this.tweens.add({
                    targets: fightSplash,
                    alpha: 0,
                    scale: fightTargetScale * 1.5,
                    duration: 150,
                    ease: 'Power2',
                    onComplete: () => {
                        fightSplash.destroy();
                    }
                });

                // Unfreeze input - START THE FIGHT!
                this.inputFrozen = false;
            });
        });
    }

    /**
     * Shows a round result message (e.g., "Player 1 Wins Round!")
     */
    private showRoundResult(text: string) {
        const { width, height } = this.scale;

        const resultText = this.add.text(width / 2, height / 2, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '40px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(1000);

        // Animate the text
        this.tweens.add({
            targets: resultText,
            y: height / 2 - 20,
            duration: 500,
            ease: 'Power2'
        });

        // Fade out after delay
        this.time.delayedCall(2000, () => {
            this.tweens.add({
                targets: resultText,
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    resultText.destroy();
                }
            });
        });
    }

    /**
     * Shows the final match result and provides play again option
     */
    private showMatchOver(text: string) {
        const { width, height } = this.scale;

        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
        overlay.setDepth(999);

        // Match Result Text
        this.add.text(width / 2, height / 2 - 80, text, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '48px',
            color: '#ffcc00',
            stroke: '#000',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(1000);

        // Score display
        this.add.text(width / 2, height / 2, `${this.p1RoundWins} - ${this.p2RoundWins}`, {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '36px',
            color: '#ffffff',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(1000);

        // Play Again Button
        const playAgainBtn = this.add.text(width / 2, height / 2 + 100, 'PLAY AGAIN', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.resetMatchState();
                this.scene.restart();
            })
            .on('pointerover', () => playAgainBtn.setStyle({ fill: '#ff0' }))
            .on('pointerout', () => playAgainBtn.setStyle({ fill: '#fff' }));

        // Main Menu Button
        const menuBtn = this.add.text(width / 2, height / 2 + 160, 'MAIN MENU', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '20px',
            color: '#aaaaaa',
            backgroundColor: '#222222',
            padding: { x: 15, y: 8 }
        })
            .setOrigin(0.5)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.resetMatchState();
                // Stop fight music
                if (this.fightMusic && this.fightMusic.isPlaying) {
                    this.fightMusic.stop();
                }
                this.scene.start('TitleScene');
            })
            .on('pointerover', () => menuBtn.setStyle({ fill: '#ff0' }))
            .on('pointerout', () => menuBtn.setStyle({ fill: '#aaa' }));
    }

    /**
     * Resets fighters and game state for the next round
     */
    private resetForNextRound() {
        // Reset health
        this.p1.hp = this.p1.maxHp;
        this.p2.hp = this.p2.maxHp;

        // Reset positions
        this.p1.setPosition(this.p1StartX, this.p1StartY);
        this.p2.setPosition(this.p2StartX, this.p2StartY);

        // Reset velocities
        this.p1.setVelocity(0, 0);
        this.p2.setVelocity(0, 0);

        // Reset fighter states
        this.p1.currentState = 'IDLE';
        this.p2.currentState = 'IDLE';
        this.p1.clearTint();
        this.p2.clearTint();

        // Reset combo counters
        this.p1.resetCombo();
        this.p2.resetCombo();

        // Reset burst meters and stale moves
        this.p1.resetBurstMeter();
        this.p2.resetBurstMeter();
        this.p1.resetStaleMoves();
        this.p2.resetStaleMoves();

        // Reset invincibility
        this.p1.invincible = false;
        this.p2.invincible = false;

        // Reset hitstun
        this.p1.hitstunRemaining = 0;
        this.p2.hitstunRemaining = 0;

        // Reset tech recovery
        this.p1.canTechRecover = false;
        this.p2.canTechRecover = false;

        // Reset timer
        this.roundTimer = 99;
        this.timerText.setText('99');

        // Reset round state
        this.roundOver = false;

        // Update UI
        this.p1HealthBar.setHealth(this.p1.hp);
        this.p2HealthBar.setHealth(this.p2.hp);
        this.p1HealthBar.setBurstMeter(0);
        this.p2HealthBar.setBurstMeter(0);

        // Start the next round sequence
        this.startRoundSequence();
    }

    /**
     * Resets all match state (for complete restart)
     */
    private resetMatchState() {
        this.currentRound = 1;
        this.p1RoundWins = 0;
        this.p2RoundWins = 0;
        this.roundOver = false;
        this.inputFrozen = false;
    }
}
