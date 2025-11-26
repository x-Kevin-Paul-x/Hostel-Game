import Phaser from 'phaser';
import { InputMap } from './InputManager';

export type FighterState = 'IDLE' | 'WALK' | 'JUMP' | 'ATTACK' | 'STUNNED' | 'KO';

export class Fighter extends Phaser.Physics.Arcade.Sprite {
    public hp: number = 100;
    public maxHp: number = 100;
    public isPlayer1: boolean;
    public currentState: FighterState = 'IDLE';
    public lastAttackType: 'punch' | 'kick' | 'jab' | null = null;

    public attackBox: Phaser.GameObjects.Rectangle;
    private moveSpeed: number = 160;
    private jumpForce: number = -500;

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

    update(input: InputMap) {
        // Ensure body is aligned with feet if texture loaded
        if (this.body && this.height > 0) {
            const body = this.body as Phaser.Physics.Arcade.Body;
            // Center horizontally: (width - body.width) / 2
            // Align bottom: height - body.height
            // We subtract 55 to account for whitespace at the bottom of the sprite.
            // TWEAK THIS NUMBER: Increase it to move the box UP, Decrease it to move the box DOWN.
            body.setOffset((this.width - body.width) / 2, this.height - body.height - 55);
        }

        if (this.currentState === 'KO' || this.currentState === 'STUNNED') {
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            return;
        }

        // Update attack box position (relative to feet now)
        const offsetX = this.flipX ? -10 : 10;
        this.attackBox.setPosition(this.x + offsetX, this.y - 80);

        // Movement
        if (this.currentState !== 'ATTACK') {
            if (input.left) {
                this.setVelocityX(-this.moveSpeed);
                this.setFlipX(true);
                if (this.body?.touching.down) {
                    this.currentState = 'WALK';
                    // Play character-specific walk animation if available
                    try {
                        const texKey = (this.texture as Phaser.Textures.Texture).key;
                        const charName = texKey.split('_')[0];
                        const animKey = `${charName}_walk`;
                        if (this.anims && this.anims.animationManager.exists(animKey)) {
                            this.play(animKey, true);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            } else if (input.right) {
                this.setVelocityX(this.moveSpeed);
                this.setFlipX(false);
                if (this.body?.touching.down) {
                    this.currentState = 'WALK';
                    try {
                        const texKey = (this.texture as Phaser.Textures.Texture).key;
                        const charName = texKey.split('_')[0];
                        const animKey = `${charName}_walk`;
                        if (this.anims && this.anims.animationManager.exists(animKey)) {
                            this.play(animKey, true);
                        }
                    } catch (e) { }
                }
            } else {
                this.setVelocityX(0);
                if (this.body?.touching.down) {
                    this.currentState = 'IDLE';
                    // Try to play idle animation, else fall back to static idle texture
                    try {
                        const texKey = (this.texture as Phaser.Textures.Texture).key;
                        const charName = texKey.split('_')[0];
                        const animKey = `${charName}_idle`;
                        if (this.anims && this.anims.animationManager.exists(animKey)) {
                            this.play(animKey, true);
                        } else if (this.scene.textures.exists(`${charName}_idle`)) {
                            this.setTexture(`${charName}_idle`);
                        } else if (this.scene.textures.exists(`${charName}_idle_0`)) {
                            this.setTexture(`${charName}_idle_0`);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }

            // Jump
            if (input.jump && this.body?.touching.down) {
                this.setVelocityY(this.jumpForce);
                this.currentState = 'JUMP';
            }
        }

        // Attacks
        if (input.jab && this.currentState !== 'ATTACK') {
            this.performAttack('jab');
        } else if (input.punch && this.currentState !== 'ATTACK') {
            this.performAttack('punch');
        } else if (input.kick && this.currentState !== 'ATTACK') {
            this.performAttack('kick');
        }
    }
    performAttack(type: 'punch' | 'kick' | 'jab') {
        this.currentState = 'ATTACK';
        this.setVelocityX(0); // Stop moving when attacking
        this.lastAttackType = type;

        // Play attack animation if present
        try {
            const texKey = (this.texture as Phaser.Textures.Texture).key;
            const charName = texKey.split('_')[0];
            const animKey = `${charName}_${type}`;
            if (this.anims && this.anims.animationManager.exists(animKey)) {
                this.play(animKey, true);
            }
        } catch (e) {
            // ignore if texture key not parsable
        }

        // Timings differ by attack type (startup, active window, recovery)
        let startup = 100;
        let activeWindow = 200;
        let recovery = 400;
        if (type === 'jab') {
            startup = 60;
            activeWindow = 140;
            recovery = 300;
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

        // Disable hitbox after active window (to avoid long multi-hit windows)
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

    takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.currentState = 'KO';
            this.setTint(0xff0000);
            this.setVelocity(0, 0);
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        } else {
            this.currentState = 'STUNNED';
            this.setTint(0xffaa00);
            if (this.attackBox.body) (this.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
            this.scene.time.delayedCall(300, () => {
                if (this.currentState === 'STUNNED') {
                    this.currentState = 'IDLE';
                    this.clearTint();
                }
            });
        }
    }
}
