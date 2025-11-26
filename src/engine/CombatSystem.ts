import Phaser from 'phaser';
import { Fighter } from './Fighter';

export class CombatSystem {
    private scene: Phaser.Scene;
    private fighters: Fighter[];

    constructor(scene: Phaser.Scene, fighters: Fighter[]) {
        this.scene = scene;
        this.fighters = fighters;
    }

    update() {
        const p1 = this.fighters[0];
        const p2 = this.fighters[1];

        // Check P1 attack
        if (p1.currentState === 'ATTACK') {
            this.scene.physics.overlap(p1.attackBox, p2, () => {
                this.handleHit(p1, p2);
            });
        }

        // Check P2 attack
        if (p2.currentState === 'ATTACK') {
            this.scene.physics.overlap(p2.attackBox, p1, () => {
                this.handleHit(p2, p1);
            });
        }
    }

    private handleHit(attacker: Fighter, defender: Fighter) {
        if (defender.currentState === 'KO' || defender.currentState === 'STUNNED') return;

        // Damage
        defender.takeDamage(10);

        // Knockback
        const direction = attacker.x < defender.x ? 1 : -1;
        defender.setVelocityX(direction * 200);
        defender.setVelocityY(-200);

        // Hit Stop / Screen Shake
        this.scene.cameras.main.shake(50, 0.01);

        // Disable hitbox to prevent multi-hit in same attack frame window
        // (Since we re-enable it in Fighter.performAttack, this effectively makes it single hit)
        if (attacker.attackBox.body) {
            (attacker.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }
    }
}
