import Phaser from 'phaser';
import { Fighter } from '../engine/Fighter';
import { InputManager } from '../engine/InputManager';

import { AIController } from '../engine/AIController';
import { MatchManager } from '../engine/MatchManager';
import { SettingsManager } from '../utils/SettingsManager';

export class BattleScene extends Phaser.Scene {
    private p1!: Fighter;
    private p2!: Fighter;
    private inputManager!: InputManager;
    private aiController?: AIController;
    private matchManager!: MatchManager; // Added MatchManager property

    private isVsAI: boolean = false; // Default to local 2-player (AI off)
    private inputFrozen: boolean = false; // Freeze input during round start sequence

    // Best of 3 Round System (1V1 Mode only)
    private gameMode: '1v1' | 'story' = '1v1'; // Current game mode
    // roundTimer, currentRound, p1RoundWins, p2RoundWins, ROUNDS_TO_WIN, MAX_ROUNDS are now managed by MatchManager

    // Round win indicators (UI elements)


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
        this.matchManager = new MatchManager(this, this.p1, this.p2, {
            p1StartX: this.p1StartX,
            p1StartY: this.p1StartY,
            p2StartX: this.p2StartX,
            p2StartY: this.p2StartY,
            gameMode: this.gameMode
        });
        this.matchManager.setCallbacks(
            (winner) => this.handleRoundEnd(winner),
            (winner) => this.handleMatchEnd(winner),
            () => this.startRoundSequence(),
            (frozen) => this.inputFrozen = frozen
        );

        if (this.isVsAI) {
            this.aiController = new AIController(this.p2, this.p1);
        }

        // Launch UI Scene
        this.scene.launch('BattleUIScene', {
            p1CharName: this.p1CharName,
            p2CharName: this.p2CharName,
            maxRounds: this.matchManager.ROUNDS_TO_WIN // Use MatchManager's constant
        });

        // Listen for events from UI
        this.events.on('pauseMusic', () => {
            if (this.fightMusic && this.fightMusic.isPlaying) {
                this.fightMusic.pause();
            }
        });

        this.events.on('resumeMusic', () => {
            const settings = SettingsManager.getInstance();
            if (settings.get('fightMusicEnabled') && this.fightMusic && !this.fightMusic.isPlaying) {
                (this.fightMusic as Phaser.Sound.WebAudioSound).setVolume(settings.get('fightMusicVolume'));
                this.fightMusic.play();
            }
        });

        this.events.on('playAgain', () => {
            this.resetMatchState();
            this.scene.restart();
            this.scene.stop('BattleUIScene');
        });

        this.events.on('mainMenu', () => {
            this.resetMatchState();
            if (this.fightMusic) {
                this.fightMusic.stop();
            }
            this.scene.stop('BattleScene');
            this.scene.stop('BattleUIScene');
            this.scene.start('TitleScene');
        });

        this.events.on('roundSequenceComplete', () => {
            this.inputFrozen = false;
        });

        // Timer
        this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (this.matchManager.roundOver || this.inputFrozen) return;
                this.matchManager.roundTimer--;
                this.events.emit('updateTimer', this.matchManager.roundTimer);
                if (this.matchManager.roundTimer <= 0) {
                    this.matchManager.handleTimeOut();
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
        if (this.matchManager.roundOver || this.inputFrozen) return;

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

        this.events.emit('updateHealth', this.p1.fState.hp, this.p2.fState.hp, this.p1.fState.burstMeter, this.p2.fState.burstMeter);
        this.matchManager.checkRoundEnd();
    }

    // Callbacks from MatchManager
    private handleRoundEnd(winner: 'p1' | 'p2' | 'draw') {
        // This method is called by MatchManager when a round ends
        // MatchManager already handles updating round wins and determining if match is over
        // This scene just needs to react to the events MatchManager emits
        if (winner === 'p1') {
            this.events.emit('showRoundResult', 'Player 1 Wins Round!');
        } else if (winner === 'p2') {
            this.events.emit('showRoundResult', 'Player 2 Wins Round!');
        } else {
            this.events.emit('showRoundResult', 'Draw!');
        }
        this.events.emit('updateRounds', this.matchManager.p1RoundsWon, this.matchManager.p2RoundsWon);
    }

    private handleMatchEnd(winner: 'p1' | 'p2' | 'draw') {
        // This method is called by MatchManager when the match ends
        let message = '';
        if (winner === 'p1') message = 'Player 1 Wins the Match!';
        else if (winner === 'p2') message = 'Player 2 Wins the Match!';
        else message = 'Match Draw!';

        this.time.delayedCall(2000, () => {
            this.events.emit('showMatchOver', message, this.matchManager.p1RoundsWon, this.matchManager.p2RoundsWon);
        });
    }

    // ========== BEST OF 3 ROUND SYSTEM METHODS ==========



    /**
     * Executes the round start sequence:
     * 1. Freeze input
     * 2. Show round title for 1 second
     * 3. Show FIGHT splash for 0.75 seconds
     * 4. Unfreeze and start round
     */
    private startRoundSequence() {
        this.inputFrozen = true;
        this.events.emit('startRoundSequence', this.matchManager.currentRound);
        this.events.emit('updateTimer', this.matchManager.roundTimer);
        this.events.emit('updateHealth', this.p1.fState.hp, this.p2.fState.hp, this.p1.fState.burstMeter, this.p2.fState.burstMeter);
        this.events.emit('updateRounds', this.matchManager.p1RoundsWon, this.matchManager.p2RoundsWon);
    }



    /**
     * Resets all match state (for complete restart)
     */
    private resetMatchState() {
        this.matchManager.resetMatchState();
        this.inputFrozen = false;
    }
}
