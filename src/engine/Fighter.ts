import Phaser from 'phaser';
import { InputMap } from './InputManager';
import { FighterState } from './FighterState';

export class Fighter extends Phaser.Physics.Arcade.Sprite {
    // Systems
    public fState: FighterState;

    // Core ID
    public isPlayer1: boolean;
    public characterName: string;

    // Movement speeds
    private moveSpeed: number = 240; // Snappy ground movement
    private jumpForce: number = -620; // Strong initial jump
    private doubleJumpForce: number = -530; // Solid second jump

    // Attack properties
    public attackBox: Phaser.GameObjects.Rectangle;
    private attackTimers: Phaser.Time.TimerEvent[] = [];

    // AI helpers
    public targetEnemy?: Fighter;

    constructor(scene: Phaser.Scene, x: number, y: number, texture: string, isPlayer1: boolean) {
        super(scene, x, y, texture);

        this.isPlayer1 = isPlayer1;
        this.fState = new FighterState(100, isPlayer1);

        // Extract character name from texture (e.g. 'Ryu_idle_0' -> 'Ryu')
        this.characterName = texture.split('_')[0];

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
                if (this.fState.current === 'JUMP') {
                    this.playCharacterAnim('jump_air', true);
                    this.fState.jumpPhase = 'airborne';
                }
            } else if (animation.key.endsWith('_walk_start')) {
                if (this.fState.current === 'WALK') {
                    this.playCharacterAnim('walk', true); // Chains to walk loop
                }
            } else if (animation.key.endsWith('_duck_start')) {
                if (this.fState.current === 'DUCK') {
                    this.playCharacterAnim('duck', true); // Chains to duck loop
                }
            } else if (animation.key.endsWith('_duck_end')) {
                if (this.fState.current === 'DUCK') {
                    this.fState.current = 'IDLE';
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

            if (this.fState.isDucking) {
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
        const wasAirborne = this.fState.isAirborne;
        this.fState.isAirborne = !body?.touching.down;

        // Update jump phase based on velocity and grounded state
        this.updateJumpPhase(body, wasAirborne);

        // Reset double jump when landing
        if (wasAirborne && !this.fState.isAirborne) {
            this.fState.hasDoubleJumped = false;
            this.fState.canDoubleJump = false;
        }

        // Apply variable gravity for better jump feel
        if (this.fState.isAirborne && body) {
            if (body.velocity.y > 0) {
                // Falling - apply stronger gravity
                body.setGravityY(this.fState.fallingGravity - this.fState.normalGravity);
            } else {
                // Rising - normal gravity
                body.setGravityY(0);
            }
            // Fast fall when holding down
            if (input.duck && body.velocity.y > -100) {
                body.setGravityY(this.fState.fallingGravity);
            }
        } else if (body) {
            body.setGravityY(0);
        }

        // Handle hitstun countdown
        if (this.fState.current === 'HITSTUN') {
            this.fState.hitstunRemaining -= 16; // Approximate frame time

            // Burst out of combo (costs full burst meter)
            if (this.fState.canBurst && this.fState.burstMeter >= this.fState.burstCost && (input.block && input.jump)) {
                this.performBurst();
                return;
            }

            // Tech recovery - press block during knockback to recover faster
            if (this.fState.canTechRecover && input.block && !this.fState.isAirborne) {
                this.fState.hitstunRemaining = 0;
                this.fState.current = 'IDLE';
                this.clearTint();
                this.setVelocityX(0);
                // Brief invincibility after tech
                this.fState.invincible = true;
                this.scene.time.delayedCall(150, () => {
                    this.fState.invincible = false;
                });
                this.showTechEffect();
                return;
            }

            if (this.fState.hitstunRemaining <= 0) {
                this.fState.current = 'IDLE';
                this.clearTint();
                this.fState.canTechRecover = false;
            }
            return;
        }

        // Handle hitstun/stunned states - no input allowed
        if (this.fState.current === 'KO' || this.fState.current === 'STUNNED') {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        }

        // Handle blocking state (only on ground and not attacking)
        if (input.block && !this.fState.isAirborne && this.fState.current !== 'ATTACK' && this.fState.current !== 'AIR_ATTACK') {
            this.fState.isBlocking = true;
            if (this.fState.current !== 'BLOCK') {
                this.fState.current = 'BLOCK';
                this.setVelocityX(0);
            }
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        } else if (this.fState.isDucking && !input.duck) {
            this.fState.isDucking = false; // Reset to normal hitbox
            if (this.fState.current === 'DUCK') {
                if (this.checkAnimExists('duck_end')) {
                    this.playCharacterAnim('duck_end', false);
                } else {
                    this.fState.current = 'IDLE';
                }
            }
        }

        // Update attack box position - position at chest/arm level for jab
        const offsetX = this.fState.facingRight ? 60 : -60; // Horizontal offset based on facing direction
        const attackY = this.y - (this.displayHeight * 0.6); // 60% up from feet (chest level)
        this.attackBox.setPosition(this.x + offsetX, attackY);

        // Don't process movement if attacking, blocking, ducking, or landing
        if (this.fState.current === 'ATTACK' || this.fState.current === 'AIR_ATTACK' ||
            this.fState.isBlocking || this.fState.isDucking || this.fState.current === 'LANDING') {
            // But we do allow jump inputs to be buffered potentially, for now we exit
        } else {
            // Movement logic
            const currentSpeed = this.fState.isAirborne ? this.moveSpeed * this.fState.airControl : this.moveSpeed;

            if (input.left) {
                if (this.fState.isAirborne) {
                    const targetVel = -currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.18));
                } else {
                    this.setVelocityX(-currentSpeed);
                }
                this.setFlipX(true);
                this.fState.facingRight = false;

                if (!this.fState.isAirborne) {
                    this.fState.current = 'WALK';
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
                if (this.fState.isAirborne) {
                    const targetVel = currentSpeed;
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(Phaser.Math.Linear(currentVel, targetVel, 0.18));
                } else {
                    this.setVelocityX(currentSpeed);
                }
                this.setFlipX(false);
                this.fState.facingRight = true;

                if (!this.fState.isAirborne) {
                    this.fState.current = 'WALK';
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
                if (this.fState.isAirborne) {
                    const currentVel = body?.velocity.x || 0;
                    this.setVelocityX(currentVel * 0.96);
                } else {
                    this.setVelocityX(0);
                    this.fState.current = 'IDLE';
                    this.playCharacterAnim('idle');
                    this.fState.lastJabStep = 0;
                }
            }
        }

        // Jump mechanics with double jump
        if (input.jump && !this.fState.isBlocking && !this.fState.isDucking && this.fState.current !== 'ATTACK') {
            if (!this.fState.isAirborne) {
                // Ground jump
                this.setVelocityY(this.jumpForce);
                this.fState.current = 'JUMP';
                this.fState.canDoubleJump = true;
                this.fState.jumpPhase = 'rising';
                this.playCharacterAnim('jump_start', false);
            } else if (this.fState.canDoubleJump && !this.fState.hasDoubleJumped) {
                // Double jump
                this.setVelocityY(this.doubleJumpForce);
                this.fState.hasDoubleJumped = true;
                this.fState.jumpPhase = 'rising';
                this.playCharacterAnim('jump_start', false);
            }
        }

        // Enable double jump after leaving ground (for a brief window)
        if (this.fState.isAirborne && !wasAirborne) {
            this.fState.canDoubleJump = true;
        }

        // Attack cooldown check
        const jabJustPressed = input.jab && !this.fState.prevJabDown;
        this.fState.prevJabDown = input.jab;
        const canAttack = time - this.fState.lastAttackTime > this.fState.attackCooldown;

        // Ground attacks
        if (!this.fState.isAirborne) {
            // Check for jab chain (Noel specific two-part jab)
            if (jabJustPressed && this.fState.current === 'ATTACK' && this.fState.lastAttackType === 'jab' && this.fState.lastJabStep === 1) {
                this.performAttack('jab_2', time);
                this.fState.lastJabStep = 2;
            } else if (canAttack) {
                // Allow starting or restarting a jab if cooldown is over
                if (jabJustPressed && (this.fState.current !== 'ATTACK' || this.fState.lastAttackType === 'jab')) {
                    if (this.checkAnimExists('jab_1')) {
                        this.performAttack('jab_1', time);
                        this.fState.lastJabStep = 1;
                    } else {
                        this.performAttack('jab', time);
                        this.fState.lastJabStep = 0;
                    }
                } else if (input.punch && this.fState.current !== 'ATTACK') {
                    this.performAttack('punch', time);
                    this.fState.lastJabStep = 0;
                } else if (input.kick && this.fState.current !== 'ATTACK') {
                    this.performAttack('kick', time);
                    this.fState.lastJabStep = 0;
                }
            }
        }

        // Air attacks
        if (this.fState.isAirborne && canAttack && this.fState.current !== 'AIR_ATTACK') {
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
            const animKey = `${charName}_${anim} `;
            return (this.anims && this.anims.animationManager.exists(animKey));
        } catch (e) {
            return false;
        }
    }

    private updateJumpPhase(body: Phaser.Physics.Arcade.Body, wasAirborne: boolean) {
        if (!this.fState.isAirborne && wasAirborne) {
            // Just landed
            if (this.fState.current === 'JUMP' || this.fState.current === 'AIR_ATTACK') {
                this.fState.jumpPhase = 'landing';
                this.fState.current = 'LANDING';
                this.playCharacterAnim('jump_land', false);

                // After landing animation, return to idle
                this.scene.time.delayedCall(200, () => {
                    if (this.fState.current === 'LANDING') {
                        this.fState.current = 'IDLE';
                        this.fState.jumpPhase = 'none';
                    }
                });
            }
        } else if (this.fState.isAirborne && (this.fState.current === 'JUMP' || this.fState.current === 'AIR_ATTACK')) {
            // In the air - ensure jump_air plays after jump_start or when falling
            if (body && body.velocity.y > 0) {
                this.fState.jumpPhase = 'falling';
                this.playCharacterAnim('jump_air', true);
            } else if (this.fState.jumpPhase === 'airborne') {
                this.playCharacterAnim('jump_air', true);
            } else if (body && body.velocity.y >= -100) {
                // Near peak, transition to airborne if not already
                if (this.fState.jumpPhase === 'rising') {
                    this.fState.jumpPhase = 'airborne';
                    this.playCharacterAnim('jump_air', true);
                }
            }
        } else if (!this.fState.isAirborne) {
            this.fState.jumpPhase = 'none';
        }
    }

    performAirAttack(type: 'air_punch' | 'air_kick', time: number) {
        this.fState.current = 'AIR_ATTACK';
        this.fState.lastAttackType = type;
        this.fState.lastAttackTime = time;

        // Air attacks have shorter timings
        const startup = 50;
        const activeWindow = 180;
        const recovery = 250;

        // Try to play jab animation for air attacks (or use what's available)
        this.playCharacterAnim('jab', false);

        this.scene.time.delayedCall(startup, () => {
            if ((this.fState.current === 'AIR_ATTACK' || this.fState.current === 'JUMP') && this.attackBox.body) {
                (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = true;
            }
        });

        this.scene.time.delayedCall(startup + activeWindow, () => {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        });

        this.scene.time.delayedCall(recovery, () => {
            if (this.fState.current === 'AIR_ATTACK') {
                this.fState.current = this.fState.isAirborne ? 'JUMP' : 'IDLE';
                if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            }
        });
    }

    performAttack(type: 'punch' | 'kick' | 'jab' | 'jab_1' | 'jab_2', time: number) {
        // Clear old attack timers to allow chaining/canceling
        this.attackTimers.forEach(t => t.remove());
        this.attackTimers = [];

        this.fState.current = 'ATTACK';
        this.setVelocityX(0);
        this.fState.lastAttackType = type.startsWith('jab') ? 'jab' : type as any;
        this.fState.lastAttackTime = time;

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
            if (this.fState.current === 'ATTACK' && this.attackBox.body) {
                (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = true;
            }
        }));

        // Disable hitbox after active window
        this.attackTimers.push(this.scene.time.delayedCall(startup + activeWindow, () => {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }));

        // Reset state after full recovery
        this.attackTimers.push(this.scene.time.delayedCall(recovery, () => {
            if (this.fState.current === 'ATTACK') {
                this.fState.current = 'IDLE';
                this.fState.lastJabStep = 0;
                if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            }
        }));
    }

    applyHitstun(duration: number, knockbackX: number, knockbackY: number) {
        this.fState.current = 'HITSTUN';
        this.fState.hitstunRemaining = duration;
        this.setVelocity(knockbackX, knockbackY);
        this.setTint(0xffaa00);
        if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    resetCombo() {
        this.fState.comboCount = 0;
    }

    incrementCombo(time: number) {
        if (time - this.fState.lastHitTime < this.fState.comboTimer) {
            this.fState.comboCount++;
        } else {
            this.fState.comboCount = 1;
        }
        this.fState.lastHitTime = time;
    }

    takeDamage(amount: number, _time: number = 0, knockbackX: number = 0, knockbackY: number = 0) {
        // Invincibility check
        if (this.fState.invincible) return;

        // Reduce damage if blocking
        if (this.fState.isBlocking) {
            amount = Math.floor(amount * 0.15); // Only take 15% damage when blocking
            // Chip damage visual
            this.setTint(0x00aaff);
            this.scene.time.delayedCall(100, () => {
                if (this.fState.current !== 'KO') this.clearTint();
            });
            // Small pushback when blocking
            const direction = knockbackX > 0 ? 1 : -1;
            this.setVelocityX(direction * 120);
            // Build burst meter when blocking
            this.fState.burstMeter = Math.min(this.fState.maxBurst, this.fState.burstMeter + amount * 2);
            return;
        }

        this.fState.hp -= amount;

        // Build burst meter when taking damage (more when taking combos)
        this.fState.burstMeter = Math.min(this.fState.maxBurst, this.fState.burstMeter + amount * 3);
        this.fState.canBurst = this.fState.burstMeter >= this.fState.burstCost;

        // Start invincibility frames
        this.fState.invincible = true;
        this.scene.time.delayedCall(this.fState.invincibilityDuration, () => {
            this.fState.invincible = false;
        });

        if (this.fState.hp <= 0) {
            this.fState.hp = 0;
            this.fState.current = 'KO';
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
            this.fState.canTechRecover = false;
            this.scene.time.delayedCall(this.fState.techRecoveryWindow, () => {
                if (this.fState.current === 'HITSTUN') {
                    this.fState.canTechRecover = true;
                }
            });
        }
    }

    // Perform burst to break out of combo
    private performBurst() {
        this.fState.canBurst = false;
        this.fState.current = 'IDLE';
        this.fState.hitstunRemaining = 0;
        this.clearTint();

        // Push away attacker and become invincible
        this.fState.invincible = true;
        this.scene.time.delayedCall(400, () => {
            this.fState.invincible = false;
        });

        // Visual burst effect
        this.showBurstEffect();

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
        const count = this.fState.recentAttacks.filter((a: string) => a === attackType).length;
        // Each repeat reduces damage by 10%, min 50%
        return Math.max(0.5, 1 - (count * 0.1));
    }

    // Track attack for stale move scaling
    public trackAttack(attackType: string) {
        this.fState.recentAttacks.push(attackType);
        if (this.fState.recentAttacks.length > 8) { // maxRecentAttacks
            this.fState.recentAttacks.shift();
        }
    }

    // Reset stale moves (called at round start)
    public resetStaleMoves() {
        this.fState.recentAttacks = [];
    }

    // Reset burst meter (called at round start)
    public resetBurstMeter() {
        this.fState.burstMeter = 0;
        this.fState.canBurst = false;
    }
}
