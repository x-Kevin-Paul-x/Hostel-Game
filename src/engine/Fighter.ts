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
    public isDucking: boolean = false;

    // Combo system
    public comboCount: number = 0;
    public lastHitTime: number = 0;
    private comboTimer: number = 800; // ms to continue combo

    // Burst/Combo Breaker system
    public burstMeter: number = 100; // Fills up when taking damage
    public maxBurstMeter: number = 100;
    private burstCost: number = 100;
    public canBurst: boolean = false;

    // Stale move scaling - tracks recent attacks
    private recentAttacks: string[] = [];
    private maxRecentAttacks: number = 8;

    // Tech recovery - recover faster from knockback
    public canTechRecover: boolean = false;
    private techRecoveryWindow: number = 300; // ms window to tech

    // Air control
    public isAirborne: boolean = false;
    public canDoubleJump: boolean = false;
    public hasDoubleJumped: boolean = false;
    private airControl: number = 0.85; // Good air control for combos

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
    private moveSpeed: number = 240; // Snappy ground movement
    private jumpForce: number = -620; // Strong initial jump
    private doubleJumpForce: number = -530; // Solid second jump

    // Jab chain tracking
    private lastJabStep: number = 0;
    private prevJabDown: boolean = false;
    private attackTimers: Phaser.Time.TimerEvent[] = [];

    // Gravity scaling for better jump feel
    private normalGravity: number = 900; // Slightly floaty for combo potential
    private fallingGravity: number = 1500; // Fast fall for responsiveness

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, isPlayer1: boolean) {
        super(scene, x, y, texture);
        this.isPlayer1 = isPlayer1;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);

        // Set origin to bottom center for proper ground alignment
        this.setOrigin(0.5, 1);

        // Physics body size will be set after scaling in refreshBody()

        // Attack Box
        this.attackBox = scene.add.rectangle(x, y, 60, 40, 0xff0000, 0);
        scene.physics.add.existing(this.attackBox);
        if (this.attackBox.body) {
            (this.attackBox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
            (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }
        this.attackBox.setVisible(false); // Set to true for debug

        // Handle animation chaining
        this.on('animationcomplete', (animation: Phaser.Animations.Animation) => {
            if (animation.key.endsWith('_jump_start')) {
                if (this.currentState === 'JUMP') {
                    this.playCharacterAnim('jump_air', true);
                    this.jumpPhase = 'airborne';
                }
            } else if (animation.key.endsWith('_walk_start')) {
                if (this.currentState === 'WALK') {
                    this.playCharacterAnim('walk', true); // Chains to walk loop
                }
            } else if (animation.key.endsWith('_duck_start')) {
                if (this.currentState === 'DUCK') {
                    this.playCharacterAnim('duck', true); // Chains to duck loop
                }
            } else if (animation.key.endsWith('_duck_end')) {
                if (this.currentState === 'DUCK') {
                    this.currentState = 'IDLE';
                }
            }
        });
    }

    // Call this after setting scale to properly size the hitbox
    public initializeHitbox() {
        if (this.body && this.width > 0 && this.height > 0) {
            const body = this.body as Phaser.Physics.Arcade.Body;

            // Hitbox should cover the character body (narrower for better gameplay)
            const hitboxWidth = this.width * 0.4;  // 40% of sprite width for better collision
            const hitboxHeight = this.height * 0.85; // 85% of sprite height

            body.setSize(hitboxWidth, hitboxHeight);

            // Since origin is (0.5, 1) - bottom center:
            // Offset X: center the hitbox horizontally
            // Offset Y: position from top of sprite, leaving small gap at top
            const offsetX = (this.width - hitboxWidth) / 2;
            const offsetY = this.height * 0.15; // Start 15% from top to leave head gap
            body.setOffset(offsetX, offsetY);

            // Important physics settings for solid collision
            body.setMass(100); // Heavy mass
            body.setBounce(0, 0); // No bouncing
            body.setMaxVelocity(400, 800); // Limit max velocity
            body.setDragX(1000); // High friction to stop quickly when pushed
            body.pushable = false; // Prevent being pushed by other bodies
        }
    }

    update(input: InputMap, time: number) {
        // Dynamic hitbox sizing based on state (ducking = smaller hitbox)
        if (this.body && this.height > 0) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            const hitboxWidth = this.width * 0.4;

            // Ducking reduces hitbox height significantly
            let hitboxHeight: number;
            let offsetY: number;

            if (this.isDucking) {
                hitboxHeight = this.height * 0.45; // 45% height when ducking
                offsetY = this.height * 0.55; // Lower offset to keep feet on ground
            } else {
                hitboxHeight = this.height * 0.85;
                offsetY = this.height * 0.15;
            }

            const offsetX = (this.width - hitboxWidth) / 2;
            body.setSize(hitboxWidth, hitboxHeight);
            body.setOffset(offsetX, offsetY);
        }

        const body = this.body as Phaser.Physics.Arcade.Body;

        // Dynamic immovable logic removed to fix falling through floor
        // We rely on pushable=false and high mass/drag for solid feel

        // Track airborne state

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

            // Burst out of combo (costs full burst meter)
            if (this.canBurst && this.burstMeter >= this.burstCost && (input.block && input.jump)) {
                this.performBurst();
                return;
            }

            // Tech recovery - press block during knockback to recover faster
            if (this.canTechRecover && input.block && !this.isAirborne) {
                this.hitstunRemaining = 0;
                this.currentState = 'IDLE';
                this.clearTint();
                this.setVelocityX(0);
                // Brief invincibility after tech
                this.invincible = true;
                this.scene.time.delayedCall(150, () => {
                    this.invincible = false;
                });
                this.showTechEffect();
                return;
            }

            if (this.hitstunRemaining <= 0) {
                this.currentState = 'IDLE';
                this.clearTint();
                this.canTechRecover = false;
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
            this.isDucking = true; // Enable smaller hitbox
            if (this.currentState !== 'DUCK') {
                this.currentState = 'DUCK';
                this.setVelocityX(0);
                if (this.checkAnimExists('duck_start')) {
                    this.playCharacterAnim('duck_start', true);
                } else {
                    this.playCharacterAnim('duck', true);
                }
            }
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        } else if (this.isDucking && !input.duck) {
            this.isDucking = false; // Reset to normal hitbox
            if (this.currentState === 'DUCK') {
                if (this.checkAnimExists('duck_end')) {
                    this.playCharacterAnim('duck_end', false);
                } else {
                    this.currentState = 'IDLE';
                }
            }
        }

        // Update attack box position - position at chest/arm level for jab
        const offsetX = this.flipX ? -60 : 60; // Horizontal offset based on facing direction
        const attackY = this.y - (this.displayHeight * 0.6); // 60% up from feet (chest level)
        this.attackBox.setPosition(this.x + offsetX, attackY);

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
                    // Air control - smoother interpolation for better feel
                    const targetVel = -currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.18));
                } else {
                    this.setVelocityX(-currentSpeed);
                }
                this.setFlipX(true);
                this.facingRight = false;
                if (!this.isAirborne) {
                    this.currentState = 'WALK';
                    if (this.checkAnimExists('walk_start')) {
                        const currentAnim = this.anims.currentAnim?.key;
                        const charName = this.texture.key.split('_')[0];
                        if (currentAnim !== `${charName}_walk_start` && currentAnim !== `${charName}_walk`) {
                            this.playCharacterAnim('walk_start', true);
                        }
                    } else {
                        this.playCharacterAnim('walk', true);
                    }
                }
            } else if (input.right) {
                if (this.isAirborne) {
                    // Air control - smoother interpolation
                    const targetVel = currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.18));
                } else {
                    this.setVelocityX(currentSpeed);
                }
                this.setFlipX(false);
                this.facingRight = true;
                if (!this.isAirborne) {
                    this.currentState = 'WALK';
                    if (this.checkAnimExists('walk_start')) {
                        const currentAnim = this.anims.currentAnim?.key;
                        const charName = this.texture.key.split('_')[0];
                        if (currentAnim !== `${charName}_walk_start` && currentAnim !== `${charName}_walk`) {
                            this.playCharacterAnim('walk_start', true);
                        }
                    } else {
                        this.playCharacterAnim('walk', true);
                    }
                }
            } else {
                if (this.isAirborne) {
                    // Air friction - gradual slowdown
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(currentVel * 0.96);
                } else {
                    this.setVelocityX(0);
                    this.currentState = 'IDLE';
                    this.playCharacterAnim('idle');
                    this.lastJabStep = 0;
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
        const jabJustPressed = input.jab && !this.prevJabDown;
        this.prevJabDown = input.jab;
        const canAttack = time - this.lastAttackTime > this.attackCooldown;

        // Ground attacks
        if (!this.isAirborne) {
            // Check for jab chain (Noel specific two-part jab)
            if (jabJustPressed && this.currentState === 'ATTACK' && this.lastAttackType === 'jab' && this.lastJabStep === 1) {
                this.performAttack('jab_2', time);
                this.lastJabStep = 2;
            } else if (canAttack) {
                // Allow starting or restarting a jab if cooldown is over
                if (jabJustPressed && (this.currentState !== 'ATTACK' || this.lastAttackType === 'jab')) {
                    if (this.checkAnimExists('jab_1')) {
                        this.performAttack('jab_1', time);
                        this.lastJabStep = 1;
                    } else {
                        this.performAttack('jab', time);
                        this.lastJabStep = 0;
                    }
                } else if (input.punch && this.currentState !== 'ATTACK') {
                    this.performAttack('punch', time);
                    this.lastJabStep = 0;
                } else if (input.kick && this.currentState !== 'ATTACK') {
                    this.performAttack('kick', time);
                    this.lastJabStep = 0;
                }
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

    private checkAnimExists(anim: string): boolean {
        try {
            const texKey = (this.texture as Phaser.Textures.Texture).key;
            const charName = texKey.split('_')[0];
            const animKey = `${charName}_${anim}`;
            return (this.anims && this.anims.animationManager.exists(animKey));
        } catch (e) {
            return false;
        }
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
        } else if (this.isAirborne && (this.currentState === 'JUMP' || this.currentState === 'AIR_ATTACK')) {
            // In the air - ensure jump_air plays after jump_start or when falling
            if (body && body.velocity.y > 0) {
                this.jumpPhase = 'falling';
                this.playCharacterAnim('jump_air', true);
            } else if (this.jumpPhase === 'airborne') {
                this.playCharacterAnim('jump_air', true);
            } else if (body && body.velocity.y >= -100) {
                // Near peak, transition to airborne if not already
                if (this.jumpPhase === 'rising') {
                    this.jumpPhase = 'airborne';
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

    performAttack(type: 'punch' | 'kick' | 'jab' | 'jab_1' | 'jab_2', time: number) {
        // Clear old attack timers to allow chaining/canceling
        this.attackTimers.forEach(t => t.remove());
        this.attackTimers = [];

        this.currentState = 'ATTACK';
        this.setVelocityX(0);
        this.lastAttackType = type.startsWith('jab') ? 'jab' : type as any;
        this.lastAttackTime = time;

        // Play attack animation if present
        this.playCharacterAnim(type, false);

        // Timings differ by attack type (startup, active window, recovery)
        // Snappier timings for more responsive combat
        let startup = 80;
        let activeWindow = 180;
        let recovery = 350;
        if (type.startsWith('jab')) {
            startup = 35;          // Faster jab startup
            activeWindow = 120;    // Short but effective
            // Use longer recovery for full single jab (like Kevin's 30 frames)
            // to ensure the full animation plays, but keep chained jabs snappy.
            recovery = (type === 'jab') ? 350 : 180;
        } else if (type === 'kick') {
            startup = 110;         // Faster kick startup
            activeWindow = 220;    // Good active frames
            recovery = 420;        // Reasonable recovery
        }

        // Enable hitbox after startup frames
        this.attackTimers.push(this.scene.time.delayedCall(startup, () => {
            if (this.currentState === 'ATTACK' && this.attackBox.body) {
                (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = true;
            }
        }));

        // Disable hitbox after active window
        this.attackTimers.push(this.scene.time.delayedCall(startup + activeWindow, () => {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }));

        // Reset state after full recovery
        this.attackTimers.push(this.scene.time.delayedCall(recovery, () => {
            if (this.currentState === 'ATTACK') {
                this.currentState = 'IDLE';
                this.lastJabStep = 0;
                if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            }
        }));
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
            this.setVelocityX(direction * 120);
            // Build burst meter when blocking
            this.burstMeter = Math.min(this.maxBurstMeter, this.burstMeter + amount * 2);
            return;
        }

        this.hp -= amount;

        // Build burst meter when taking damage (more when taking combos)
        this.burstMeter = Math.min(this.maxBurstMeter, this.burstMeter + amount * 3);
        this.canBurst = this.burstMeter >= this.burstCost;

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
            // Calculate hitstun based on damage - reduced base hitstun for better counterplay
            // Also scales down with combo count to prevent infinite combos
            const baseHitstun = 120 + (amount * 8);
            const hitstun = Math.max(80, baseHitstun * 0.85); // Cap minimum hitstun

            // Increase horizontal knockback for more spacing, but keep vertical minimal
            const adjustedKnockbackX = knockbackX * 1.25;
            const adjustedKnockbackY = Math.min(knockbackY * 0.6, -50); // Reduce vertical knockback significantly

            this.applyHitstun(hitstun, adjustedKnockbackX, adjustedKnockbackY);

            // Enable tech recovery window after a brief delay
            this.canTechRecover = false;
            this.scene.time.delayedCall(this.techRecoveryWindow, () => {
                if (this.currentState === 'HITSTUN') {
                    this.canTechRecover = true;
                }
            });
        }
    }

    // Perform burst to break out of combo
    private performBurst() {
        this.burstMeter = 0;
        this.canBurst = false;
        this.currentState = 'IDLE';
        this.hitstunRemaining = 0;
        this.clearTint();

        // Push away attacker and become invincible
        this.invincible = true;
        this.scene.time.delayedCall(400, () => {
            this.invincible = false;
        });

        // Visual burst effect
        this.showBurstEffect();

        // Strong pushback in both directions
        const pushDirection = this.facingRight ? -1 : 1;
        this.setVelocity(pushDirection * 300, -200);
    }

    private showBurstEffect() {
        // Create expanding ring effect
        const ring = this.scene.add.circle(this.x, this.y - this.displayHeight / 2, 20, 0xffff00, 0.8);
        ring.setStrokeStyle(4, 0xffffff);

        this.scene.tweens.add({
            targets: ring,
            scaleX: 8,
            scaleY: 8,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => ring.destroy()
        });

        // Flash effect
        this.setTint(0xffffff);
        this.scene.time.delayedCall(100, () => {
            this.clearTint();
        });

        // Screen shake
        this.scene.cameras.main.shake(150, 0.015);

        // Burst text
        const burstText = this.scene.add.text(this.x, this.y - this.displayHeight - 30, 'BURST!', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '24px',
            color: '#ffff00',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: burstText,
            y: burstText.y - 50,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => burstText.destroy()
        });
    }

    private showTechEffect() {
        // Quick flash and text
        const techText = this.scene.add.text(this.x, this.y - this.displayHeight - 20, 'TECH!', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '16px',
            color: '#00ffff',
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: techText,
            y: techText.y - 30,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => techText.destroy()
        });

        // Brief cyan flash
        this.setTint(0x00ffff);
        this.scene.time.delayedCall(80, () => {
            this.clearTint();
        });
    }

    // Get stale move multiplier - repeated attacks do less damage
    public getStaleMoveMultiplier(attackType: string): number {
        const count = this.recentAttacks.filter(a => a === attackType).length;
        // Each repeat reduces damage by 10%, min 50%
        return Math.max(0.5, 1 - (count * 0.1));
    }

    // Track attack for stale move scaling
    public trackAttack(attackType: string) {
        this.recentAttacks.push(attackType);
        if (this.recentAttacks.length > this.maxRecentAttacks) {
            this.recentAttacks.shift();
        }
    }

    // Reset stale moves (called at round start)
    public resetStaleMoves() {
        this.recentAttacks = [];
    }

    // Reset burst meter (called at round start)
    public resetBurstMeter() {
        this.burstMeter = 0;
        this.canBurst = false;
    }
}
