import { Fighter } from './Fighter';
import { InputMap } from './InputManager';

type AIState = 'AGGRESSIVE' | 'DEFENSIVE' | 'NEUTRAL' | 'PUNISH' | 'RETREAT' | 'PRESSURE' | 'SETUP';

export class AIController {
    private me: Fighter;
    private target: Fighter;
    private nextActionTime: number = 0;
    private currentInput: InputMap;

    // AI State machine
    private aiState: AIState = 'NEUTRAL';
    private stateTimer: number = 0;
    private stateChangeCooldown: number = 0;

    // Difficulty settings (0-1, higher = harder)
    private difficulty: number = 0.85;
    private reactionSpeed: number = 100; // ms to react to opponent actions

    // Combat awareness
    private lastTargetState: string = 'IDLE';
    private targetAttackStartTime: number = 0;
    private blockHoldTime: number = 0;
    private lastTargetX: number = 0;
    private targetMovingTowards: boolean = false;

    // Combo tracking
    private comboSequence: string[] = [];
    private comboTimer: number = 0;
    private inCombo: boolean = false;

    // Spacing preferences
    private optimalRange: number = 75;
    private jabRange: number = 55;
    private pokeRange: number = 100;
    private safeRange: number = 140;

    // Anti-spam and variety
    private consecutiveAttacks: number = 0;
    private maxConsecutiveAttacks: number = 4;
    private lastAttackType: string = '';
    private attackVarietyCounter: { [key: string]: number } = { jab: 0, punch: 0, kick: 0 };

    // Pressure and mixup
    private pressureLevel: number = 0;
    private mixupChoice: number = 0;
    private frameAdvantage: boolean = false;

    private playerAttackFrequency: number = 0;

    constructor(me: Fighter, target: Fighter, difficulty: number = 0.85) {
        this.me = me;
        this.target = target;
        this.difficulty = Math.min(1, Math.max(0.5, difficulty));
        this.reactionSpeed = 150 - (this.difficulty * 100); // 50-100ms reaction at high difficulty
        this.currentInput = this.getEmptyInput();
    }

    update(time: number): InputMap {
        // Track opponent movement patterns
        this.analyzeOpponent(time);

        // Update AI state based on situation
        this.updateAIState(time);

        // Process combo if in one
        if (this.inCombo && time < this.comboTimer) {
            return this.executeCombo();
        }

        // Throttle decision making for more human-like behavior
        if (time < this.nextActionTime) {
            // But still allow reactive blocking
            if (this.shouldReactBlock(time)) {
                this.currentInput.block = true;
                this.currentInput.left = false;
                this.currentInput.right = false;
            }
            return this.currentInput;
        }

        // Reset input
        this.currentInput = this.getEmptyInput();

        const distance = this.getDistance();
        const targetIsAttacking = this.target.fState.current === 'ATTACK' || this.target.fState.current === 'AIR_ATTACK';
        const targetIsVulnerable = this.target.fState.current === 'HITSTUN' || this.target.fState.current === 'STUNNED';
        const targetIsRecovering = this.target.fState.current === 'LANDING';
        const iAmAirborne = this.me.fState.isAirborne;
        const targetIsAirborne = this.target.fState.isAirborne;
        const meBlocking = this.me.fState.isBlocking;

        // Detect target attack start for reactions
        if (targetIsAttacking && this.lastTargetState !== 'ATTACK' && this.lastTargetState !== 'AIR_ATTACK') {
            this.targetAttackStartTime = time;
        }
        this.lastTargetState = this.target.fState.current;

        // Execute behavior based on AI state
        switch (this.aiState) {
            case 'AGGRESSIVE':
                this.executeAggressive(distance, time);
                break;
            case 'DEFENSIVE':
                this.executeDefensive(distance, time, targetIsAttacking);
                break;
            case 'PUNISH':
                this.executePunish(distance, time, targetIsVulnerable);
                break;
            case 'RETREAT':
                this.executeRetreat(distance);
                break;
            case 'PRESSURE':
                this.executePressure(distance, time, meBlocking);
                break;
            case 'SETUP':
                this.executeSetup(distance);
                break;
            default:
                this.executeNeutral(distance, targetIsAttacking, targetIsAirborne);
        }

        // Air behavior override
        if (iAmAirborne) {
            this.handleAirBehavior(distance);
        }

        // Anti-air reaction - improved timing
        if (targetIsAirborne && !iAmAirborne && distance < 130 && distance > 30) {
            const antiAirChance = this.difficulty * 0.75;
            if (Math.random() < antiAirChance) {
                // Choose attack based on timing
                if (this.target.body && (this.target.body as Phaser.Physics.Arcade.Body).velocity.y > 0) {
                    // Falling - time it well
                    this.currentInput.punch = true;
                    this.consecutiveAttacks++;
                }
            }
        }

        // Whiff punish - react to opponent's missed attack
        if (targetIsRecovering && distance < this.optimalRange) {
            this.startCombo(['jab', 'punch', 'kick'], time);
        }

        // Randomize next decision time for more human-like behavior
        const baseDelay = 60 + (1 - this.difficulty) * 80;
        this.nextActionTime = time + baseDelay + Math.random() * 60;

        return this.currentInput;
    }

    private analyzeOpponent(time: number) {
        // Track if opponent is approaching
        const currentTargetX = this.target.x;
        const distanceToMe = Math.abs(this.me.x - this.target.x);
        const prevDistance = Math.abs(this.me.x - this.lastTargetX);

        this.targetMovingTowards = distanceToMe < prevDistance;
        this.lastTargetX = currentTargetX;

        // Track attack frequency
        if (this.target.fState.current === 'ATTACK') {
            this.playerAttackFrequency++;
        }

        // Decay frequency counter
        if (time % 1000 < 20) {
            this.playerAttackFrequency = Math.max(0, this.playerAttackFrequency - 1);
        }
    }
    private shouldReactBlock(time: number): boolean {
        const targetIsAttacking = this.target.fState.current === 'ATTACK' || this.target.fState.current === 'AIR_ATTACK';
        const distance = this.getDistance();

        if (!targetIsAttacking || distance > 120) return false;

        // React after reaction speed delay
        const timeSinceAttack = time - this.targetAttackStartTime;
        if (timeSinceAttack > this.reactionSpeed && timeSinceAttack < 500) {
            return Math.random() < this.difficulty * 0.9;
        }
        return false;
    }

    private updateAIState(time: number) {
        if (time < this.stateChangeCooldown) return;

        const hpPercent = this.me.fState.hp / this.me.fState.maxHp;
        const targetHpPercent = this.target.fState.hp / this.target.fState.maxHp;
        const distance = this.getDistance();

        // Priority state transitions
        if (this.target.fState.current === 'HITSTUN' || this.target.fState.current === 'STUNNED') {
            this.aiState = 'PUNISH';
            this.consecutiveAttacks = 0;
            this.stateChangeCooldown = time + 300;
            return;
        }

        // If we have frame advantage, go to pressure
        if (this.frameAdvantage && distance < this.optimalRange) {
            this.aiState = 'PRESSURE';
            this.frameAdvantage = false;
            this.stateChangeCooldown = time + 500;
            return;
        }

        // Health-based decisions
        if (hpPercent < 0.25 && targetHpPercent > 0.4) {
            // Desperate - mix between aggressive gambles and defensive play
            this.aiState = Math.random() < 0.4 ? 'AGGRESSIVE' : 'DEFENSIVE';
            this.stateChangeCooldown = time + 800;
            return;
        }

        if (hpPercent < 0.4 && targetHpPercent > 0.6) {
            // Losing - play smarter
            this.aiState = Math.random() < 0.6 ? 'DEFENSIVE' : 'NEUTRAL';
            this.stateChangeCooldown = time + 600;
            return;
        }

        if (hpPercent > targetHpPercent + 0.25) {
            // Winning - maintain pressure but don't get reckless
            this.aiState = Math.random() < 0.7 ? 'PRESSURE' : 'AGGRESSIVE';
            this.stateChangeCooldown = time + 700;
            return;
        }

        // Near wall - be more aggressive if opponent is cornered
        if (this.isOpponentNearWall()) {
            this.aiState = 'PRESSURE';
            this.stateChangeCooldown = time + 500;
            return;
        }

        // Time-based state changes with smarter distribution
        if (time > this.stateTimer) {
            const r = Math.random();
            if (r < 0.35) {
                this.aiState = 'AGGRESSIVE';
            } else if (r < 0.5) {
                this.aiState = 'DEFENSIVE';
            } else if (r < 0.7) {
                this.aiState = 'SETUP';
            } else {
                this.aiState = 'NEUTRAL';
            }
            this.stateTimer = time + 800 + Math.random() * 1500;
            this.stateChangeCooldown = time + 400;
        }
    }

    private executeAggressive(distance: number, time: number) {
        // Smart approach - dash in when safe
        if (distance > this.optimalRange * 1.3) {
            this.moveTowardsTarget();
            // Dash with double-tap or jump-in
            if (distance > 180 && Math.random() < 0.04 * this.difficulty) {
                this.currentInput.jump = true;
            }
        } else if (distance < this.jabRange * 0.6) {
            // Too close - create space for optimal attack
            this.moveAwayFromTarget();
        }

        // Attack when in range
        if (distance < this.optimalRange * 1.1 && this.consecutiveAttacks < this.maxConsecutiveAttacks) {
            // Start a combo instead of single attacks
            if (!this.inCombo && Math.random() < 0.6 * this.difficulty) {
                this.startCombo(['jab', 'jab', 'punch'], time);
            } else {
                this.selectAttack(distance);
            }
        }

        // Calculated jump-in attack
        if (distance > 120 && distance < 200 && Math.random() < 0.025 * this.difficulty) {
            this.currentInput.jump = true;
            this.moveTowardsTarget();
        }
    }

    private executeDefensive(distance: number, time: number, targetIsAttacking: boolean) {
        // Maintain safe distance but don't run away too much
        if (distance < this.safeRange * 0.7) {
            this.moveAwayFromTarget();
        } else if (distance > this.safeRange * 1.2) {
            // Don't let them control the whole screen
            this.moveTowardsTarget();
        }

        // Intelligent blocking
        if (targetIsAttacking && distance < 110) {
            const timeSinceAttack = time - this.targetAttackStartTime;
            if (timeSinceAttack > this.reactionSpeed) {
                this.currentInput.block = true;
                this.currentInput.left = false;
                this.currentInput.right = false;
                this.blockHoldTime = time + 200 + Math.random() * 100;
            }
        }

        // Hold block for appropriate duration
        if (time < this.blockHoldTime) {
            this.currentInput.block = true;
            this.currentInput.left = false;
            this.currentInput.right = false;
        }

        // Counter-attack after successful block (frame advantage)
        if (!targetIsAttacking && this.me.fState.isBlocking && distance < this.optimalRange) {
            this.frameAdvantage = true;
        }

        // Occasional counter-poke
        if (!targetIsAttacking && !this.target.fState.isAirborne && distance < this.pokeRange) {
            if (Math.random() < 0.15 * this.difficulty) {
                this.currentInput.jab = true;
                this.consecutiveAttacks++;
            }
        }
    }

    private executePunish(distance: number, time: number, targetIsVulnerable: boolean) {
        if (!targetIsVulnerable) {
            this.aiState = 'NEUTRAL';
            return;
        }

        // Rush in if not in range
        if (distance > this.jabRange) {
            this.moveTowardsTarget();
            return;
        }

        // Execute optimal combo based on distance
        if (!this.inCombo) {
            if (distance < this.jabRange) {
                // Close range - max damage combo
                this.startCombo(['jab', 'jab', 'punch', 'kick'], time);
            } else {
                // Medium range - reliable combo
                this.startCombo(['punch', 'kick'], time);
            }
        }
    }

    private executePressure(distance: number, time: number, meBlocking: boolean) {
        // Apply offensive pressure with mixups
        if (distance > this.jabRange) {
            this.moveTowardsTarget();
        }

        // Don't pressure while blocking
        if (meBlocking) return;

        // Mixup attacks based on choice
        if (!this.inCombo && distance < this.optimalRange) {
            this.mixupChoice = (this.mixupChoice + 1) % 4;

            switch (this.mixupChoice) {
                case 0:
                    // Jab pressure string
                    this.startCombo(['jab', 'jab'], time);
                    break;
                case 1:
                    // Delayed heavy
                    this.startCombo(['jab', 'punch'], time);
                    break;
                case 2:
                    // Low threat (duck + attack would be ideal)
                    this.currentInput.kick = true;
                    this.consecutiveAttacks++;
                    break;
                case 3:
                    // Throw attempt / reset
                    this.moveAwayFromTarget();
                    this.pressureLevel = 0;
                    break;
            }
            this.pressureLevel++;

            // Reset pressure after several attempts to avoid predictability
            if (this.pressureLevel > 3) {
                this.aiState = 'NEUTRAL';
                this.pressureLevel = 0;
            }
        }
    }

    private executeSetup(distance: number) {
        // Positioning and waiting for openings
        const idealDistance = this.optimalRange * 1.1;

        if (Math.abs(distance - idealDistance) > 30) {
            if (distance > idealDistance) {
                this.moveTowardsTarget();
            } else {
                this.moveAwayFromTarget();
            }
        } else {
            // At ideal distance - feint and probe
            if (Math.random() < 0.02) {
                // Fake approach
                this.moveTowardsTarget();
            }

            // Poke with long range attack
            if (Math.random() < 0.08 * this.difficulty) {
                this.currentInput.kick = true;
                this.consecutiveAttacks++;
            }
        }

        // Jump over projectiles / read opponent (if they're idle too long)
        if (this.target.fState.current === 'IDLE' && Math.random() < 0.02) {
            this.currentInput.jump = true;
            this.moveTowardsTarget();
        }

        // Transition to aggression if setup takes too long
        if (Math.random() < 0.01) {
            this.aiState = 'AGGRESSIVE';
        }
    }

    private executeRetreat(distance: number) {
        // Get away
        this.moveAwayFromTarget();

        // Jump away occasionally
        if (Math.random() < 0.04) {
            this.currentInput.jump = true;
        }

        // Block if cornered
        if (this.isNearWall()) {
            this.currentInput.block = true;
            this.currentInput.left = false;
            this.currentInput.right = false;

            // Try to jump out when safe
            if (!this.target.fState.isAirborne && distance > 80) {
                this.currentInput.jump = true;
                this.currentInput.block = false;
            }
        }

        // Counter if opponent overextends
        if (distance < this.jabRange && Math.random() < 0.3 * this.difficulty) {
            this.currentInput.jab = true;
            this.currentInput.block = false;
        }
    }

    private executeNeutral(distance: number, targetIsAttacking: boolean, targetIsAirborne: boolean) {
        // Smart footsies - maintain optimal spacing
        const targetDistance = this.optimalRange * 1.2;

        if (Math.abs(distance - targetDistance) > 40) {
            if (distance > targetDistance) {
                this.moveTowardsTarget();
            } else {
                this.moveAwayFromTarget();
            }
        } else {
            // Micro-adjustments at range
            if (Math.random() < 0.15) {
                if (Math.random() < 0.5) {
                    this.moveTowardsTarget();
                } else {
                    this.moveAwayFromTarget();
                }
            }
        }

        // React to approaches
        if (this.targetMovingTowards && distance < this.pokeRange) {
            if (Math.random() < 0.25 * this.difficulty) {
                this.currentInput.jab = true; // Check approach
                this.consecutiveAttacks++;
            }
        }

        // Anti-air preparation
        if (targetIsAirborne && distance < 150) {
            // Wait for them to fall into anti-air range
            if (this.target.body && (this.target.body as Phaser.Physics.Arcade.Body).velocity.y > 50) {
                this.currentInput.punch = true;
            }
        }

        // Whiff punish attempt
        if (targetIsAttacking && distance > this.optimalRange && distance < 130) {
            // They whiffed - prepare to punish
            this.moveTowardsTarget();
        }

        // Random poke at good range
        if (distance > 70 && distance < 110 && Math.random() < 0.04 * this.difficulty) {
            this.currentInput.kick = true;
            this.consecutiveAttacks++;
        }

        // Occasional strategic jump
        if (Math.random() < 0.008 && !targetIsAirborne) {
            this.currentInput.jump = true;
            this.moveTowardsTarget();
        }
    }

    private handleAirBehavior(distance: number) {
        // Determine if this is an offensive or defensive jump
        const myVelocityY = this.me.body ? (this.me.body as Phaser.Physics.Arcade.Body).velocity.y : 0;

        // Air attacks when close and falling
        if (distance < 90 && myVelocityY > 0) {
            // Timing attack for when we'll land
            if (Math.random() < 0.5 * this.difficulty) {
                if (distance < 50) {
                    this.currentInput.punch = true;
                } else {
                    this.currentInput.kick = true;
                }
            }
        }

        // Air control - always try to position well
        if (this.me.y < this.target.y + 50) {
            this.moveTowardsTarget();
        }

        // Empty jump to bait anti-airs
        if (Math.random() < 0.2) {
            // Don't attack - just land
        }
    }

    // Combo system
    private startCombo(sequence: string[], time: number) {
        this.comboSequence = sequence;
        this.inCombo = true;
        this.comboTimer = time + sequence.length * 180; // rough combo duration
    }

    private executeCombo(): InputMap {
        this.currentInput = this.getEmptyInput();

        if (this.comboSequence.length === 0) {
            this.inCombo = false;
            this.frameAdvantage = true; // Assume we have advantage after combo
            return this.currentInput;
        }

        const distance = this.getDistance();

        // Move towards target during combo
        if (distance > this.jabRange) {
            this.moveTowardsTarget();
        }

        // Pop next attack from combo
        const nextAttack = this.comboSequence.shift();
        if (nextAttack && distance < this.optimalRange) {
            switch (nextAttack) {
                case 'jab':
                    this.currentInput.jab = true;
                    break;
                case 'punch':
                    this.currentInput.punch = true;
                    break;
                case 'kick':
                    this.currentInput.kick = true;
                    break;
            }
            this.consecutiveAttacks++;
            this.lastAttackType = nextAttack;
        }

        // Check if combo is over
        if (this.comboSequence.length === 0) {
            this.inCombo = false;
            this.frameAdvantage = true;
        }

        return this.currentInput;
    }

    private selectAttack(distance: number) {
        const r = Math.random();
        let attack: string;

        if (distance < this.jabRange) {
            // Very close - fast attacks dominate
            if (r < 0.55) {
                attack = 'jab';
            } else if (r < 0.85) {
                attack = 'punch';
            } else {
                attack = 'kick';
            }
        } else if (distance < this.optimalRange) {
            // Medium range - balanced
            if (r < 0.35) {
                attack = 'jab';
            } else if (r < 0.65) {
                attack = 'punch';
            } else {
                attack = 'kick';
            }
        } else {
            // Longer range - use kick to poke
            if (r < 0.15) {
                attack = 'punch';
            } else {
                attack = 'kick';
            }
        }

        // Avoid repeating the same attack too much
        if (attack === this.lastAttackType && this.attackVarietyCounter[attack] > 2) {
            // Pick something else
            const options = ['jab', 'punch', 'kick'].filter(a => a !== attack);
            attack = options[Math.floor(Math.random() * options.length)];
            this.attackVarietyCounter = { jab: 0, punch: 0, kick: 0 };
        }

        this.attackVarietyCounter[attack] = (this.attackVarietyCounter[attack] || 0) + 1;
        this.lastAttackType = attack;

        switch (attack) {
            case 'jab':
                this.currentInput.jab = true;
                break;
            case 'punch':
                this.currentInput.punch = true;
                break;
            case 'kick':
                this.currentInput.kick = true;
                break;
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
        return this.me.x < 80 || this.me.x > 1200;
    }

    private isOpponentNearWall(): boolean {
        return this.target.x < 100 || this.target.x > 1180;
    }

    private getEmptyInput(): InputMap {
        return {
            left: false, right: false, up: false, down: false,
            jump: false, punch: false, jab: false, kick: false,
            block: false, duck: false
        };
    }
}
