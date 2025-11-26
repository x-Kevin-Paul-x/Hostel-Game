import Phaser from 'phaser';
import { Fighter } from './Fighter';
import { InputMap } from './InputManager';

export class AIController {
    private me: Fighter;
    private target: Fighter;
    private nextActionTime: number = 0;
    private currentInput: InputMap;

    constructor(scene: Phaser.Scene, me: Fighter, target: Fighter) {
        this.me = me;
        this.target = target;
        this.currentInput = this.getEmptyInput();
    }

    update(time: number): InputMap {
        if (time < this.nextActionTime) {
            return this.currentInput;
        }

        // Reset input
        this.currentInput = this.getEmptyInput();

        const distance = Phaser.Math.Distance.Between(this.me.x, this.me.y, this.target.x, this.target.y);
        const isFacingTarget = (this.me.x < this.target.x && !this.me.flipX) || (this.me.x > this.target.x && this.me.flipX);

        // AI Logic
        if (distance > 100) {
            // Chase
            if (this.me.x < this.target.x) {
                this.currentInput.right = true;
            } else {
                this.currentInput.left = true;
            }
        } else if (distance < 60) {
            // Attack Range
            if (Math.random() > 0.3) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true;
            }
        } else {
            // In between - maybe wait or adjust
            if (Math.random() > 0.5) {
                // Move in
                if (this.me.x < this.target.x) this.currentInput.right = true;
                else this.currentInput.left = true;
            }
        }

        // Reaction to jump
        if (this.target.y < this.me.y - 50 && Math.random() > 0.5) {
            this.currentInput.jump = true;
        }

        // Random jump
        if (Math.random() < 0.02) {
            this.currentInput.jump = true;
        }

        // Set next decision time
        this.nextActionTime = time + 100 + Math.random() * 200;

        return this.currentInput;
    }

    private getEmptyInput(): InputMap {
        return { left: false, right: false, up: false, down: false, jump: false, punch: false, kick: false };
    }
}
