import { Fighter } from './Fighter';
import { InputMap } from './InputManager';

type AIState = 'AGGRESSIVE' | 'DEFENSIVE' | 'NEUTRAL' | 'PUNISH' | 'RETREAT';

export class AIController {
    private me: Fighter;
    private target: Fighter;
    private nextActionTime: number = 0;
    private currentInput: InputMap;
    
    // AI State machine
    private aiState: AIState = 'NEUTRAL';
    private stateTimer: number = 0;
    
    // Difficulty settings (0-1)
    private difficulty: number = 0.7;
    // private reactionTime: number = 150; // Reserved for future use
    
    // Combat awareness
    private lastTargetState: string = 'IDLE';
    // private targetAttackDetectedTime: number = 0; // Reserved for future use
    
    // Spacing preferences
    private optimalRange: number = 80; // Ideal distance for attacks
    private safeRange: number = 150; // Distance to maintain when defensive
    
    // Decision weights
    // private aggressionLevel: number = 0.5; // Reserved for future use
    
    // Anti-spam
    private consecutiveAttacks: number = 0;
    private maxConsecutiveAttacks: number = 3;

    constructor(me: Fighter, target: Fighter, difficulty: number = 0.7) {
        this.me = me;
        this.target = target;
        this.difficulty = difficulty;
        this.currentInput = this.getEmptyInput();
    }

    update(time: number): InputMap {
        // Update AI state based on situation
        this.updateAIState(time);
        
        // Throttle decision making for more human-like behavior
        if (time < this.nextActionTime) {
            return this.currentInput;
        }

        // Reset input
        this.currentInput = this.getEmptyInput();

        const distance = this.getDistance();
        const targetIsAttacking = this.target.currentState === 'ATTACK' || this.target.currentState === 'AIR_ATTACK';
        const targetIsVulnerable = this.target.currentState === 'HITSTUN' || this.target.currentState === 'STUNNED';
        const iAmAirborne = this.me.isAirborne;
        const targetIsAirborne = this.target.isAirborne;
        
        // Detect target attack for reactions
        if (targetIsAttacking && this.lastTargetState !== 'ATTACK' && this.lastTargetState !== 'AIR_ATTACK') {
            // Attack detected - could use for reaction timing
        }
        this.lastTargetState = this.target.currentState;
        
        // Execute behavior based on AI state
        switch (this.aiState) {
            case 'AGGRESSIVE':
                this.executeAggressive(distance, time);
                break;
            case 'DEFENSIVE':
                this.executeDefensive(distance, time, targetIsAttacking);
                break;
            case 'PUNISH':
                this.executePunish(distance, targetIsVulnerable);
                break;
            case 'RETREAT':
                this.executeRetreat(distance);
                break;
            default:
                this.executeNeutral(distance, time, targetIsAttacking, targetIsAirborne);
        }
        
        // Air behavior
        if (iAmAirborne) {
            this.handleAirBehavior(distance);
        }
        
        // Anti-air reaction
        if (targetIsAirborne && !iAmAirborne && distance < 120) {
            if (Math.random() < this.difficulty * 0.6) {
                this.currentInput.punch = true; // Anti-air
            }
        }

        // Randomize next decision time for more human-like behavior
        const baseDelay = 80 + (1 - this.difficulty) * 120;
        this.nextActionTime = time + baseDelay + Math.random() * 100;

        return this.currentInput;
    }
    
    private updateAIState(time: number) {
        const hpPercent = this.me.hp / this.me.maxHp;
        const targetHpPercent = this.target.hp / this.target.maxHp;
        
        // State transitions based on situation
        if (this.target.currentState === 'HITSTUN' || this.target.currentState === 'STUNNED') {
            this.aiState = 'PUNISH';
            this.consecutiveAttacks = 0;
        } else if (hpPercent < 0.3 && targetHpPercent > 0.5) {
            // Low health, play more carefully
            this.aiState = Math.random() < 0.7 ? 'DEFENSIVE' : 'RETREAT';
        } else if (hpPercent > targetHpPercent + 0.3) {
            // Winning - be more aggressive
            this.aiState = 'AGGRESSIVE';
        } else if (time > this.stateTimer) {
            // Random state changes
            const r = Math.random();
            if (r < 0.4) {
                this.aiState = 'AGGRESSIVE';
            } else if (r < 0.6) {
                this.aiState = 'DEFENSIVE';
            } else {
                this.aiState = 'NEUTRAL';
            }
            this.stateTimer = time + 1000 + Math.random() * 2000;
        }
    }
    
    private executeAggressive(distance: number, _time: number) {
        // Move towards optimal range
        if (distance > this.optimalRange) {
            this.moveTowardsTarget();
        } else if (distance < this.optimalRange * 0.5) {
            this.moveAwayFromTarget();
        }
        
        // Attack when in range
        if (distance < this.optimalRange * 1.2 && this.consecutiveAttacks < this.maxConsecutiveAttacks) {
            this.selectAttack(distance);
        }
        
        // Occasional jump-in attack
        if (distance > 100 && distance < 200 && Math.random() < 0.02 * this.difficulty) {
            this.currentInput.jump = true;
        }
    }
    
    private executeDefensive(distance: number, _time: number, targetIsAttacking: boolean) {
        // Maintain safe distance
        if (distance < this.safeRange) {
            this.moveAwayFromTarget();
        }
        
        // Block when target attacks
        if (targetIsAttacking && distance < 120) {
            if (Math.random() < this.difficulty * 0.8) {
                this.currentInput.block = true;
                this.currentInput.left = false;
                this.currentInput.right = false;
            }
        }
        
        // Duck under high attacks sometimes
        if (targetIsAttacking && distance < 100 && Math.random() < 0.2) {
            this.currentInput.duck = true;
            this.currentInput.block = false;
        }
        
        // Counter-attack after blocking
        if (!targetIsAttacking && distance < this.optimalRange && Math.random() < 0.3) {
            this.currentInput.jab = true;
        }
    }
    
    private executePunish(distance: number, targetIsVulnerable: boolean) {
        if (!targetIsVulnerable) {
            this.aiState = 'NEUTRAL';
            return;
        }
        
        // Rush in and combo
        if (distance > this.optimalRange * 0.8) {
            this.moveTowardsTarget();
        }
        
        // Chain attacks for combo
        if (distance < this.optimalRange * 1.2) {
            if (this.consecutiveAttacks < 2) {
                this.currentInput.jab = true;
            } else if (this.consecutiveAttacks < 3) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true; // Finisher
            }
            this.consecutiveAttacks++;
        }
    }
    
    private executeRetreat(_distance: number) {
        // Get away
        this.moveAwayFromTarget();
        
        // Jump away
        if (Math.random() < 0.03) {
            this.currentInput.jump = true;
        }
        
        // Block if cornered
        if (this.isNearWall()) {
            this.currentInput.block = true;
            this.currentInput.left = false;
            this.currentInput.right = false;
        }
    }
    
    private executeNeutral(distance: number, _time: number, targetIsAttacking: boolean, _targetIsAirborne: boolean) {
        // Footsies - move in and out
        if (distance > this.optimalRange * 1.5) {
            this.moveTowardsTarget();
        } else if (distance < this.optimalRange * 0.7) {
            this.moveAwayFromTarget();
        } else {
            // Subtle movement
            if (Math.random() < 0.3) {
                this.moveTowardsTarget();
            } else if (Math.random() < 0.3) {
                this.moveAwayFromTarget();
            }
        }
        
        // Whiff punish - attack when target misses
        if (!targetIsAttacking && this.target.currentState === 'ATTACK' && distance < this.optimalRange) {
            // Target just finished attack
            this.currentInput.punch = true;
        }
        
        // Poke at range
        if (distance > 60 && distance < 100 && Math.random() < 0.05 * this.difficulty) {
            this.currentInput.kick = true;
        }
        
        // Random jump
        if (Math.random() < 0.01) {
            this.currentInput.jump = true;
        }
    }
    
    private handleAirBehavior(distance: number) {
        // Air attacks when close
        if (distance < 100 && Math.random() < 0.4) {
            if (Math.random() < 0.5) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true;
            }
        }
        
        // Air control towards/away from target
        if (this.me.y < this.target.y - 50) {
            // Above target
            this.moveTowardsTarget();
        }
    }
    
    private selectAttack(distance: number) {
        const r = Math.random();
        
        if (distance < 50) {
            // Very close - fast attacks
            if (r < 0.6) {
                this.currentInput.jab = true;
            } else if (r < 0.85) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true;
            }
        } else if (distance < 80) {
            // Medium range
            if (r < 0.3) {
                this.currentInput.jab = true;
            } else if (r < 0.7) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true;
            }
        } else {
            // Longer range - use kick
            if (r < 0.2) {
                this.currentInput.punch = true;
            } else {
                this.currentInput.kick = true;
            }
        }
        
        this.consecutiveAttacks++;
    }
    
    private moveTowardsTarget() {
        if (this.me.x < this.target.x) {
            this.currentInput.right = true;
        } else {
            this.currentInput.left = true;
        }
    }
    
    private moveAwayFromTarget() {
        if (this.me.x < this.target.x) {
            this.currentInput.left = true;
        } else {
            this.currentInput.right = true;
        }
    }
    
    private getDistance(): number {
        return Math.abs(this.me.x - this.target.x);
    }
    
    private isNearWall(): boolean {
        return this.me.x < 100 || this.me.x > 1180;
    }

    private getEmptyInput(): InputMap {
        return { 
            left: false, right: false, up: false, down: false, 
            jump: false, punch: false, jab: false, kick: false,
            block: false, duck: false 
        };
    }
}
