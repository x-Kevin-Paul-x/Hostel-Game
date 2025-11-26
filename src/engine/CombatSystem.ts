import Phaser from 'phaser';
import { Fighter } from './Fighter';

export class CombatSystem {
    private scene: Phaser.Scene;
    private fighters: Fighter[];
    private hitStopDuration: number = 80; // Freeze frames on hit
    private isInHitStop: boolean = false;
    
    // Combo display
    private comboText?: Phaser.GameObjects.Text;
    private comboTimer: number = 0;
    
    // Attack damage values with combo scaling
    private baseDamage: Record<string, number> = {
        jab: 5,
        punch: 10,
        kick: 14,
        air_punch: 8,
        air_kick: 12
    };
    
    // Knockback values per attack
    private knockback: Record<string, { x: number, y: number }> = {
        jab: { x: 120, y: -80 },
        punch: { x: 200, y: -150 },
        kick: { x: 280, y: -200 },
        air_punch: { x: 150, y: 100 }, // Spike down in air
        air_kick: { x: 200, y: 150 }
    };

    constructor(scene: Phaser.Scene, fighters: Fighter[]) {
        this.scene = scene;
        this.fighters = fighters;
        
        // Create combo text display
        this.comboText = scene.add.text(640, 200, '', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '32px',
            color: '#ff6600',
            stroke: '#000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100).setVisible(false);
    }

    update(time: number) {
        if (this.isInHitStop) return;
        
        const p1 = this.fighters[0];
        const p2 = this.fighters[1];

        // Check P1 attack hitting P2
        if (p1.currentState === 'ATTACK' || p1.currentState === 'AIR_ATTACK') {
            this.scene.physics.overlap(p1.attackBox, p2, () => {
                this.handleHit(p1, p2, time);
            });
        }

        // Check P2 attack hitting P1
        if (p2.currentState === 'ATTACK' || p2.currentState === 'AIR_ATTACK') {
            this.scene.physics.overlap(p2.attackBox, p1, () => {
                this.handleHit(p2, p1, time);
            });
        }
        
        // Clash detection - both attacking and hitboxes overlap
        if ((p1.currentState === 'ATTACK' || p1.currentState === 'AIR_ATTACK') && 
            (p2.currentState === 'ATTACK' || p2.currentState === 'AIR_ATTACK')) {
            this.scene.physics.overlap(p1.attackBox, p2.attackBox, () => {
                this.handleClash(p1, p2);
            });
        }
        
        // Update combo display
        this.updateComboDisplay(time);
    }
    
    private updateComboDisplay(time: number) {
        const p1 = this.fighters[0];
        const p2 = this.fighters[1];
        
        // Show highest combo
        const maxCombo = Math.max(p1.comboCount, p2.comboCount);
        
        if (maxCombo >= 2 && this.comboText) {
            this.comboText.setVisible(true);
            this.comboText.setText(`${maxCombo} HIT COMBO!`);
            
            // Scale effect based on combo
            const scale = 1 + (maxCombo * 0.05);
            this.comboText.setScale(Math.min(scale, 1.5));
            
            // Color based on combo size
            if (maxCombo >= 10) {
                this.comboText.setColor('#ff0000');
            } else if (maxCombo >= 5) {
                this.comboText.setColor('#ffaa00');
            } else {
                this.comboText.setColor('#ff6600');
            }
            
            this.comboTimer = time + 1500;
        }
        
        // Hide combo after timer
        if (time > this.comboTimer && this.comboText) {
            this.comboText.setVisible(false);
        }
    }

    private handleHit(attacker: Fighter, defender: Fighter, time: number) {
        if (defender.currentState === 'KO' || defender.invincible) return;
        if (defender.currentState === 'HITSTUN' && defender.hitstunRemaining > 50) return; // Prevent rapid re-hits

        const attackType = attacker.lastAttackType || 'punch';
        
        // Calculate base damage
        let damage = this.baseDamage[attackType] || 10;
        
        // Combo damage scaling (damage reduces with combo length)
        attacker.incrementCombo(time);
        const comboScaling = Math.max(0.5, 1 - (attacker.comboCount - 1) * 0.1);
        damage = Math.ceil(damage * comboScaling);
        
        // Counter hit bonus (hit during opponent's attack startup)
        if (defender.currentState === 'ATTACK' || defender.currentState === 'AIR_ATTACK') {
            damage = Math.ceil(damage * 1.25);
            this.showCounterHit(defender.x, defender.y);
        }
        
        // Calculate knockback direction
        const direction = attacker.x < defender.x ? 1 : -1;
        const kb = this.knockback[attackType] || { x: 150, y: -100 };
        const knockbackX = kb.x * direction;
        const knockbackY = kb.y;
        
        // Apply damage with knockback
        defender.takeDamage(damage, time, knockbackX, knockbackY);

        // Hit Stop - freeze both fighters briefly
        this.applyHitStop(attacker, defender);
        
        // Screen effects
        this.scene.cameras.main.shake(60 + damage * 2, 0.008 + damage * 0.001);
        
        // Hit particles
        this.createHitParticles(defender.x, defender.y - 80);

        // Disable hitbox to prevent multi-hit
        if (attacker.attackBox.body) {
            (attacker.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        }
    }
    
    private handleClash(p1: Fighter, p2: Fighter) {
        // Both fighters get pushed back
        const pushback = 200;
        p1.setVelocityX(-pushback);
        p2.setVelocityX(pushback);
        
        // Small screen shake
        this.scene.cameras.main.shake(30, 0.005);
        
        // Clash particles at midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = Math.min(p1.y, p2.y) - 80;
        this.createClashParticles(midX, midY);
        
        // Disable both hitboxes
        if (p1.attackBox.body) (p1.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
        if (p2.attackBox.body) (p2.attackBox.body as Phaser.Physics.Arcade.Body).enable = false;
    }
    
    private applyHitStop(attacker: Fighter, defender: Fighter) {
        this.isInHitStop = true;
        
        // Store velocities
        const attackerVel = { x: attacker.body?.velocity.x || 0, y: attacker.body?.velocity.y || 0 };
        const defenderVel = { x: defender.body?.velocity.x || 0, y: defender.body?.velocity.y || 0 };
        
        // Freeze
        attacker.setVelocity(0, 0);
        defender.setVelocity(0, 0);
        
        // Resume after hit stop
        this.scene.time.delayedCall(this.hitStopDuration, () => {
            this.isInHitStop = false;
            if (attacker.currentState !== 'KO') {
                attacker.setVelocity(attackerVel.x * 0.3, attackerVel.y);
            }
            if (defender.currentState !== 'KO') {
                defender.setVelocity(defenderVel.x, defenderVel.y);
            }
        });
    }
    
    private showCounterHit(x: number, y: number) {
        const text = this.scene.add.text(x, y - 120, 'COUNTER!', {
            fontFamily: '"Press Start 2P", cursive',
            fontSize: '20px',
            color: '#ff0000',
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0.5);
        
        this.scene.tweens.add({
            targets: text,
            y: y - 180,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => text.destroy()
        });
    }
    
    private createHitParticles(x: number, y: number) {
        // Create simple particle effect
        for (let i = 0; i < 8; i++) {
            const particle = this.scene.add.circle(x, y, 6, 0xffff00);
            const angle = (i / 8) * Math.PI * 2;
            const speed = 150 + Math.random() * 100;
            
            this.scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * speed * 0.5,
                y: y + Math.sin(angle) * speed * 0.5,
                scaleX: 0,
                scaleY: 0,
                alpha: 0,
                duration: 300,
                ease: 'Power2',
                onComplete: () => particle.destroy()
            });
        }
    }
    
    private createClashParticles(x: number, y: number) {
        // Spark effect for clash
        for (let i = 0; i < 12; i++) {
            const particle = this.scene.add.star(x, y, 4, 4, 8, 0xffffff);
            const angle = (i / 12) * Math.PI * 2;
            const speed = 200;
            
            this.scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * speed * 0.3,
                y: y + Math.sin(angle) * speed * 0.3,
                angle: 360,
                scaleX: 0,
                scaleY: 0,
                duration: 250,
                ease: 'Power1',
                onComplete: () => particle.destroy()
            });
        }
    }
}
