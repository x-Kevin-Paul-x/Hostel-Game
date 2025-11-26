import Phaser from 'phaser';
import { InputMap } from './InputManager';

export type FighterState = 'IDLE' | 'WALK' | 'JUMP' | 'ATTACK' | 'STUNNED' | 'KO' | 'DUCK' | 'BLOCK' | 'AIR_ATTACK' | 'HITSTUN' | 'LANDING';

export class Fighter extends Phaser.Physics.Arcade.Sprite {
    public hp: number = 100;
    public maxHp: number = 100;
    public isPlayer1: boolean;
    public currentState: FighterState = 'IDLE';
    public lastAttackType: 'punch' | 'kick' | 'jab' | 'air_punch' | 'air_kick' | null = null;
    public isBlocking: boolean = false;

    // Combo system
    public comboCount: number = 0;
    public lastHitTime: number = 0;
    private comboTimer: number = 800; // ms to continue combo
    
    // Air control
    public isAirborne: boolean = false;
    public canDoubleJump: boolean = false;
    public hasDoubleJumped: boolean = false;
    private airControl: number = 0.7; // Reduced control in air
    
    // Jump phase tracking
    private jumpPhase: 'none' | 'rising' | 'airborne' | 'falling' | 'landing' = 'none';
    
    // Attack cooldowns
    private lastAttackTime: number = 0;
    private attackCooldown: number = 100; // Minimum time between attacks
    
    // Facing opponent
    public facingRight: boolean = true;
    
    // Stun/hitstun properties
    public hitstunRemaining: number = 0;
    public knockbackVelocity: { x: number, y: number } = { x: 0, y: 0 };
    
    // Invincibility frames after getting hit
    public invincible: boolean = false;
    private invincibilityDuration: number = 200;

    public attackBox: Phaser.GameObjects.Rectangle;
    private moveSpeed: number = 200; // Increased from 160
    private jumpForce: number = -550; // Slightly stronger jump
    private doubleJumpForce: number = -450; // Weaker second jump
    
    // Gravity scaling for floatier jumps
    private normalGravity: number = 1000;
    private fallingGravity: number = 1400; // Faster falling

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, isPlayer1: boolean) {
        super(scene, x, y, texture);
        this.isPlayer1 = isPlayer1;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);

        // Fix Physics Body Size & Alignment
        this.setOrigin(0.5, 1);
        this.setSize(80, 180);

        // Attack Box
        this.attackBox = scene.add.rectangle(x, y, 60, 40, 0xff0000, 0);
        scene.physics.add.existing(this.attackBox);
        if (this.attackBox.body) {
            (this.attackBox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
            (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }
        this.attackBox.setVisible(false); // Set to true for debug
    }

    update(input: InputMap, time: number) {
        // Ensure body is aligned with feet if texture loaded
        if (this.body && this.height > 0) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            body.setOffset((this.width - body.width) / 2, this.height - body.height - 55);
        }

        const body = this.body as Phaser.Physics.Arcade.Body;
        
        // Track airborne state
        const wasAirborne = this.isAirborne;
        this.isAirborne = !body?.touching.down;
        
        // Update jump phase based on velocity and grounded state
        this.updateJumpPhase(body, wasAirborne);
        
        // Reset double jump when landing
        if (wasAirborne && !this.isAirborne) {
            this.hasDoubleJumped = false;
            this.canDoubleJump = false;
        }
        
        // Apply variable gravity for better jump feel
        if (this.isAirborne && body) {
            if (body.velocity.y > 0) {
                // Falling - apply stronger gravity
                body.setGravityY(this.fallingGravity - this.normalGravity);
            } else {
                // Rising - normal gravity
                body.setGravityY(0);
            }
            // Fast fall when holding down
            if (input.duck && body.velocity.y > -100) {
                body.setGravityY(this.fallingGravity);
            }
        } else if (body) {
            body.setGravityY(0);
        }
        
        // Handle hitstun countdown
        if (this.currentState === 'HITSTUN') {
            this.hitstunRemaining -= 16; // Approximate frame time
            if (this.hitstunRemaining <= 0) {
                this.currentState = 'IDLE';
                this.clearTint();
            }
            return;
        }

        if (this.currentState === 'KO' || this.currentState === 'STUNNED') {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        }

        // Handle blocking state (only on ground)
        if (input.block && !this.isAirborne && this.currentState !== 'ATTACK') {
            this.isBlocking = true;
            if (this.currentState !== 'BLOCK') {
                this.currentState = 'BLOCK';
                this.setVelocityX(0);
                try {
                    const texKey = (this.texture as Phaser.Textures.Texture).key;
                    const charName = texKey.split('_')[0];
                    const animKey = `${charName}_block`;
                    if (this.anims && this.anims.animationManager.exists(animKey)) {
                        this.play(animKey, true);
                    }
                } catch (e) { }
            }
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        } else {
            this.isBlocking = false;
        }

        // Handle ducking state (only on ground)
        if (input.duck && !this.isAirborne && this.currentState !== 'ATTACK' && this.currentState !== 'BLOCK') {
            if (this.currentState !== 'DUCK') {
                this.currentState = 'DUCK';
                this.setVelocityX(0);
                try {
                    const texKey = (this.texture as Phaser.Textures.Texture).key;
                    const charName = texKey.split('_')[0];
                    const animKey = `${charName}_duck`;
                    if (this.anims && this.anims.animationManager.exists(animKey)) {
                        this.play(animKey, true);
                    }
                } catch (e) { }
            }
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        }

        // Update attack box position
        const offsetX = this.flipX ? -50 : 50;
        this.attackBox.setPosition(this.x + offsetX, this.y - 80);

        // Don't allow movement during landing
        if (this.currentState === 'LANDING') {
            this.setVelocityX(0);
            return;
        }

        // Movement with air control
        if (this.currentState !== 'ATTACK' && this.currentState !== 'AIR_ATTACK') {
            const currentSpeed = this.isAirborne ? this.moveSpeed * this.airControl : this.moveSpeed;
            
            if (input.left) {
                if (this.isAirborne) {
                    // Air control - lerp towards desired velocity
                    const targetVel = -currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.1));
                } else {
                    this.setVelocityX(-currentSpeed);
                }
                this.setFlipX(true);
                this.facingRight = false;
                if (!this.isAirborne) {
                    this.currentState = 'WALK';
                    this.playCharacterAnim('walk');
                }
            } else if (input.right) {
                if (this.isAirborne) {
                    const targetVel = currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.1));
                } else {
                    this.setVelocityX(currentSpeed);
                }
                this.setFlipX(false);
                this.facingRight = true;
                if (!this.isAirborne) {
                    this.currentState = 'WALK';
                    this.playCharacterAnim('walk');
                }
            } else {
                if (this.isAirborne) {
                    // Air friction
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(currentVel * 0.98);
                } else {
                    this.setVelocityX(0);
                    this.currentState = 'IDLE';
                    this.playCharacterAnim('idle');
                }
            }

            // Jump mechanics with double jump
            if (input.jump) {
                if (!this.isAirborne) {
                    // Ground jump
                    this.setVelocityY(this.jumpForce);
                    this.currentState = 'JUMP';
                    this.canDoubleJump = true;
                    this.jumpPhase = 'rising';
                    this.playCharacterAnim('jump_start', false);
                } else if (this.canDoubleJump && !this.hasDoubleJumped) {
                    // Double jump
                    this.setVelocityY(this.doubleJumpForce);
                    this.hasDoubleJumped = true;
                    this.jumpPhase = 'rising';
                    this.playCharacterAnim('jump_start', false);
                }
            }
            
            // Enable double jump after leaving ground (for a brief window)
            if (this.isAirborne && !wasAirborne) {
                this.canDoubleJump = true;
            }
        }

        // Attack cooldown check
        const canAttack = time - this.lastAttackTime > this.attackCooldown;
        
        // Ground attacks
        if (!this.isAirborne && canAttack) {
            if (input.jab && this.currentState !== 'ATTACK') {
                this.performAttack('jab', time);
            } else if (input.punch && this.currentState !== 'ATTACK') {
                this.performAttack('punch', time);
            } else if (input.kick && this.currentState !== 'ATTACK') {
                this.performAttack('kick', time);
            }
        }
        
        // Air attacks
        if (this.isAirborne && canAttack && this.currentState !== 'AIR_ATTACK') {
            if (input.punch) {
                this.performAirAttack('air_punch', time);
            } else if (input.kick) {
                this.performAirAttack('air_kick', time);
            }
        }
    }
    
    private playCharacterAnim(anim: string, ignoreIfPlaying: boolean = true) {
        try {
            const texKey = (this.texture as Phaser.Textures.Texture).key;
            const charName = texKey.split('_')[0];
            const animKey = `${charName}_${anim}`;
            if (this.anims && this.anims.animationManager.exists(animKey)) {
                this.play(animKey, ignoreIfPlaying);
            } else if (anim === 'idle') {
                if (this.scene.textures.exists(`${charName}_idle`)) {
                    this.setTexture(`${charName}_idle`);
                } else if (this.scene.textures.exists(`${charName}_idle_0`)) {
                    this.setTexture(`${charName}_idle_0`);
                }
            }
        } catch (e) { }
    }
    
    private updateJumpPhase(body: Phaser.Physics.Arcade.Body, wasAirborne: boolean) {
        if (!this.isAirborne && wasAirborne) {
            // Just landed
            if (this.currentState === 'JUMP' || this.currentState === 'AIR_ATTACK') {
                this.jumpPhase = 'landing';
                this.currentState = 'LANDING';
                this.playCharacterAnim('jump_land', false);
                
                // After landing animation, return to idle
                this.scene.time.delayedCall(200, () => {
                    if (this.currentState === 'LANDING') {
                        this.currentState = 'IDLE';
                        this.jumpPhase = 'none';
                    }
                });
            }
        } else if (this.isAirborne && this.currentState === 'JUMP') {
            // In the air - determine phase based on velocity
            if (body && body.velocity.y < -100) {
                // Rising phase
                if (this.jumpPhase !== 'rising') {
                    this.jumpPhase = 'rising';
                }
            } else if (body && body.velocity.y >= -100 && body.velocity.y < 100) {
                // Peak/airborne phase
                if (this.jumpPhase !== 'airborne') {
                    this.jumpPhase = 'airborne';
                    this.playCharacterAnim('jump_air', true);
                }
            } else if (body && body.velocity.y >= 100) {
                // Falling phase - continue airborne animation
                if (this.jumpPhase !== 'falling') {
                    this.jumpPhase = 'falling';
                    // Keep playing air animation while falling
                    this.playCharacterAnim('jump_air', true);
                }
            }
        } else if (!this.isAirborne) {
            this.jumpPhase = 'none';
        }
    }
    
    performAirAttack(type: 'air_punch' | 'air_kick', time: number) {
        this.currentState = 'AIR_ATTACK';
        this.lastAttackType = type;
        this.lastAttackTime = time;
        
        // Air attacks have shorter timings
        const startup = 50;
        const activeWindow = 180;
        const recovery = 250;
        
        // Try to play jab animation for air attacks (or use what's available)
        this.playCharacterAnim('jab', false);
        
        this.scene.time.delayedCall(startup, () => {
            if ((this.currentState === 'AIR_ATTACK' || this.currentState === 'JUMP') && this.attackBox.body) {
                (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = true;
            }
        });
        
        this.scene.time.delayedCall(startup + activeWindow, () => {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        });
        
        this.scene.time.delayedCall(recovery, () => {
            if (this.currentState === 'AIR_ATTACK') {
                this.currentState = this.isAirborne ? 'JUMP' : 'IDLE';
                if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            }
        });
    }
    
    performAttack(type: 'punch' | 'kick' | 'jab', time: number) {
        this.currentState = 'ATTACK';
        this.setVelocityX(0);
        this.lastAttackType = type;
        this.lastAttackTime = time;

        // Play attack animation if present
        this.playCharacterAnim(type, false);

        // Timings differ by attack type (startup, active window, recovery)
        let startup = 100;
        let activeWindow = 200;
        let recovery = 400;
        if (type === 'jab') {
            startup = 60;
            activeWindow = 140;
            recovery = 250; // Faster recovery for combo potential
        } else if (type === 'kick') {
            startup = 140;
            activeWindow = 260;
            recovery = 500;
        }

        // Enable hitbox after startup frames
        this.scene.time.delayedCall(startup, () => {
            if (this.currentState === 'ATTACK' && this.attackBox.body) {
                (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = true;
            }
        });

        // Disable hitbox after active window
        this.scene.time.delayedCall(startup + activeWindow, () => {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        });

        // Reset state after full recovery
        this.scene.time.delayedCall(recovery, () => {
            if (this.currentState === 'ATTACK') {
                this.currentState = 'IDLE';
                if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            }
        });
    }

    applyHitstun(duration: number, knockbackX: number, knockbackY: number) {
        this.currentState = 'HITSTUN';
        this.hitstunRemaining = duration;
        this.setVelocity(knockbackX, knockbackY);
        this.setTint(0xffaa00);
        if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
    }
    
    resetCombo() {
        this.comboCount = 0;
    }
    
    incrementCombo(time: number) {
        if (time - this.lastHitTime < this.comboTimer) {
            this.comboCount++;
        } else {
            this.comboCount = 1;
        }
        this.lastHitTime = time;
    }

    takeDamage(amount: number, _time: number = 0, knockbackX: number = 0, knockbackY: number = 0) {
        // Invincibility check
        if (this.invincible) return;
        
        // Reduce damage if blocking
        if (this.isBlocking) {
            amount = Math.floor(amount * 0.15); // Only take 15% damage when blocking
            // Chip damage visual
            this.setTint(0x00aaff);
            this.scene.time.delayedCall(100, () => {
                if (this.currentState !== 'KO') this.clearTint();
            });
            // Small pushback when blocking
            const direction = knockbackX > 0 ? 1 : -1;
            this.setVelocityX(direction * 80);
            return;
        }
        
        this.hp -= amount;
        
        // Start invincibility frames
        this.invincible = true;
        this.scene.time.delayedCall(this.invincibilityDuration, () => {
            this.invincible = false;
        });
        
        if (this.hp <= 0) {
            this.hp = 0;
            this.currentState = 'KO';
            this.setTint(0xff0000);
            // Dramatic KO knockback
            this.setVelocity(knockbackX * 1.5, -400);
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        } else {
            // Calculate hitstun based on damage
            const hitstun = 150 + (amount * 10);
            this.applyHitstun(hitstun, knockbackX, knockbackY);
        }
    }
}
