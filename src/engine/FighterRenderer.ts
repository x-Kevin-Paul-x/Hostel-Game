import Phaser from 'phaser';

export class FighterRenderer {
    private scene: Phaser.Scene;
    private sprite: Phaser.GameObjects.Sprite;
    private characterName: string;

    constructor(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, characterName: string) {
        this.scene = scene;
        this.sprite = sprite;
        this.characterName = characterName;
    }

    public playAnim(anim: string, ignoreIfPlaying: boolean = true) {
        // Construct the full animation key: e.g., "Ryu_idle"
        const fullAnimKey = `${this.characterName}_${anim}`;

        // Only play if the animation exists in the registry
        if (this.checkAnimExists(anim)) {
            this.sprite.play(fullAnimKey, ignoreIfPlaying);
        } else {
            // Fallback: If specific anim doesn't exist, try to set a static frame if available
            // This is useful during early development before all animations are added
            if (this.scene.textures.exists(`${this.characterName}_${anim}_0`)) {
                this.sprite.setTexture(`${this.characterName}_${anim}_0`);
            } else if (this.scene.textures.exists(`${this.characterName}_idle_0`)) {
                // Absolute fallback to idle frame
                this.sprite.setTexture(`${this.characterName}_idle_0`);
            }
        }
    }

    public checkAnimExists(anim: string): boolean {
        const fullAnimKey = `${this.characterName}_${anim}`;
        return this.scene.anims.exists(fullAnimKey);
    }

    public clearTint() {
        this.sprite.clearTint();
    }

    public setTint(color: number) {
        this.sprite.setTint(color);
    }

    public showBurstEffect() {
        // Flash white
        const originalTint = this.sprite.tintTopLeft;
        this.sprite.setTint(0xffffff);

        // Add burst particle/ring effect
        const ring = this.scene.add.circle(this.sprite.x, this.sprite.y, 10, 0x00ffff, 0.8);
        this.scene.tweens.add({
            targets: ring,
            radius: 150,
            alpha: 0,
            duration: 400,
            ease: 'Cubic.out',
            onComplete: () => {
                ring.destroy();
                // If the fighter is not hit or blocking, clear tint
                // We'll trust the main state loop to manage tinting later, but clearing here is safe
                if (originalTint !== 0xff0000 && originalTint !== 0x8888ff) {
                    this.sprite.clearTint();
                } else {
                    this.sprite.setTint(originalTint);
                }
            }
        });
    }

    public showTechEffect() {
        // Flash blue/cyan to indicate a successful tech
        this.sprite.setTintFill(0x00ffff);

        // Tech particle effect
        const particles = this.scene.add.particles(this.sprite.x, this.sprite.y, 'tech_spark', {
            speed: { min: 50, max: 150 },
            angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: 300,
            quantity: 10
        });

        // The name of the texture might not exist yet, fallback to a shape if needed.
        // Assuming we handle missing textures gracefully or use shapes. Let's use a shape based effect.

        this.scene.tweens.add({
            targets: this.sprite,
            alpha: { from: 1, to: 0.5 },
            yoyo: true,
            duration: 100,
            onComplete: () => {
                this.clearTint();
                particles.stop();
                this.scene.time.delayedCall(300, () => particles.destroy());
            }
        });
    }

}
