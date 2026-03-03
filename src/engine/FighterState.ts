export type FighterStateType = 'IDLE' | 'MOVE_FWD' | 'MOVE_BWD' | 'ATTACK' | 'BLOCK' | 'STUNNED' | 'HITSTUN' | 'KO' | 'JUMP_START' | 'AIRBORNE' | 'LANDING' | 'AIR_ATTACK' | 'WALK' | 'DUCK' | 'JUMP';

export class FighterState {
    public hp: number;
    public maxHp: number;
    public burstMeter: number = 0;
    public readonly maxBurst: number = 100;
    public current: FighterStateType = 'IDLE';
    public hitstunRemaining: number = 0;
    public isPlayer1: boolean;

    // Combo Tracking
    public comboCount: number = 0;
    public comboTimer: number = 0;
    public readonly comboTimeout: number = 1000;
    public inHitstun: boolean = false;
    public hitstunDecay: number = 0.95;

    // Advanced State
    public lastAttackType: 'punch' | 'kick' | 'jab' | 'jab_1' | 'jab_2' | 'air_punch' | 'air_kick' | null = null;
    public isAirborne: boolean = false;
    public isBlocking: boolean = false;
    public isDucking: boolean = false;
    public invincible: boolean = false;
    public invincibilityDuration: number = 300;
    public canTechRecover: boolean = false;
    public techRecoveryWindow: number = 200;
    public facingRight: boolean = true;

    // Movement & Jump properties
    public jumpPhase: 'none' | 'rising' | 'airborne' | 'falling' | 'landing' = 'none';
    public canDoubleJump: boolean = false;
    public hasDoubleJumped: boolean = false;
    public fallingGravity: number = 1500;
    public normalGravity: number = 900;
    public airControl: number = 0.85;

    // Attack properties
    public lastJabStep: number = 0;
    public prevJabDown: boolean = false;
    public lastAttackTime: number = 0;
    public attackCooldown: number = 100;
    public recentAttacks: string[] = [];
    public lastHitTime: number = 0;

    // Burst properties
    public canBurst: boolean = false;
    public burstCost: number = 100;

    // Properties for balancing
    public staleMoves: { [key: string]: number } = {};

    constructor(maxHp: number = 100, isPlayer1: boolean) {
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.isPlayer1 = isPlayer1;
    }

    public update(time: number, delta: number) {
        if (this.hitstunRemaining > 0) {
            this.hitstunRemaining -= delta;
            if (this.hitstunRemaining <= 0) {
                this.hitstunRemaining = 0;
                this.inHitstun = false;
                if (this.current === 'HITSTUN' || this.current === 'STUNNED') {
                    this.current = 'IDLE'; // Or AIRBORNE if in air, handled by Fighter
                }
            }
        }

        // Drop combo if time expired
        if (this.comboCount > 0 && time > this.comboTimer) {
            this.resetCombo();
        }
    }

    public takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.current = 'KO';
        }
    }

    public addBurst(amount: number) {
        this.burstMeter = Math.min(this.maxBurst, this.burstMeter + amount);
    }

    public resetCombo() {
        this.comboCount = 0;
    }

    public incrementCombo(time: number) {
        this.comboCount++;
        this.comboTimer = time + this.comboTimeout;
    }

    public trackAttack(attackType: string) {
        if (!this.staleMoves[attackType]) {
            this.staleMoves[attackType] = 1;
        } else {
            this.staleMoves[attackType]++;
        }
    }

    public getStaleMoveMultiplier(attackType: string): number {
        const count = this.staleMoves[attackType] || 0;
        if (count <= 1) return 1.0;
        if (count === 2) return 0.8;
        if (count === 3) return 0.6;
        if (count >= 4) return 0.4;
        return 0.4;
    }

    public resetStaleMoves() {
        this.staleMoves = {};
    }

    public resetBurstMeter() {
        this.burstMeter = 0;
    }
}
