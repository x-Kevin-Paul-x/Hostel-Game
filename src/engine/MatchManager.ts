import { Fighter } from './Fighter';

export interface MatchConfig {
    p1StartX: number;
    p1StartY: number;
    p2StartX: number;
    p2StartY: number;
    gameMode: string;
}

export class MatchManager {
    public roundTimer: number = 99;
    public p1RoundsWon: number = 0;
    public p2RoundsWon: number = 0;
    public currentRound: number = 1;

    public readonly ROUNDS_TO_WIN: number = 2;
    public readonly MAX_ROUNDS: number = 3;

    public roundOver: boolean = false;
    public matchOver: boolean = false;

    private scene: Phaser.Scene;
    private p1: Fighter;
    private p2: Fighter;
    private config: MatchConfig;

    private onRoundEnd?: (winner: 'p1' | 'p2' | 'draw') => void;
    private onMatchEnd?: (winner: 'p1' | 'p2' | 'draw') => void;
    private onRoundStart?: () => void;
    private onInputFreeze?: (frozen: boolean) => void;

    constructor(scene: Phaser.Scene, p1: Fighter, p2: Fighter, config: MatchConfig) {
        this.scene = scene;
        this.p1 = p1;
        this.p2 = p2;
        this.config = config;
    }

    public setCallbacks(
        onRoundEnd: (winner: 'p1' | 'p2' | 'draw') => void,
        onMatchEnd: (winner: 'p1' | 'p2' | 'draw') => void,
        onRoundStart: () => void,
        onInputFreeze: (frozen: boolean) => void
    ) {
        this.onRoundEnd = onRoundEnd;
        this.onMatchEnd = onMatchEnd;
        this.onRoundStart = onRoundStart;
        this.onInputFreeze = onInputFreeze;
    }

    public updateTimer() {
        if (!this.roundOver && !this.matchOver) {
            this.roundTimer = Math.max(0, this.roundTimer - 1);
            return this.roundTimer;
        }
        return this.roundTimer;
    }

    public checkRoundEnd(): boolean {
        if (this.roundOver || this.matchOver) return false;

        let roundWinner: 'p1' | 'p2' | 'draw' | null = null;
        let p1Won = false;
        let p2Won = false;

        if (this.p1.fState.hp <= 0 && this.p2.fState.hp <= 0) {
            roundWinner = 'draw';
        } else if (this.p1.fState.hp <= 0) {
            roundWinner = 'p2';
            p2Won = true;
        } else if (this.p2.fState.hp <= 0) {
            roundWinner = 'p1';
            p1Won = true;
        } else if (this.roundTimer <= 0) {
            // Time out
            if (this.p1.fState.hp > this.p2.fState.hp) {
                roundWinner = 'p1';
                p1Won = true;
            } else if (this.p2.fState.hp > this.p1.fState.hp) {
                roundWinner = 'p2';
                p2Won = true;
            } else {
                roundWinner = 'draw';
            }
        }

        if (roundWinner) {
            this.handleRoundFinish(roundWinner, p1Won, p2Won);
            return true;
        }

        return false;
    }

    private handleRoundFinish(roundWinner: 'p1' | 'p2' | 'draw', p1Won: boolean, p2Won: boolean) {
        this.roundOver = true;

        // Disable input
        if (this.onInputFreeze) this.onInputFreeze(true);

        if (this.config.gameMode === '1v1') {
            if (p1Won) this.p1RoundsWon++;
            if (p2Won) this.p2RoundsWon++;

            if (this.onRoundEnd) {
                this.onRoundEnd(roundWinner);
            }

            this.checkMatchEnd();
        } else {
            // Non-1v1 mode
            if (this.onMatchEnd) {
                this.onMatchEnd(roundWinner);
            }
        }
    }

    public handleTimeOut() {
        if (this.roundOver) return;

        let roundWinner: 'p1' | 'p2' | 'draw' = 'draw';
        let p1Won = false;
        let p2Won = false;

        if (this.p1.fState.hp > this.p2.fState.hp) {
            roundWinner = 'p1';
            p1Won = true;
        } else if (this.p2.fState.hp > this.p1.fState.hp) {
            roundWinner = 'p2';
            p2Won = true;
        }

        this.handleRoundFinish(roundWinner, p1Won, p2Won);
    }

    private checkMatchEnd() {
        let matchWinner: 'p1' | 'p2' | 'draw' | null = null;

        if (this.p1RoundsWon >= this.ROUNDS_TO_WIN) {
            matchWinner = 'p1';
            this.matchOver = true;
        } else if (this.p2RoundsWon >= this.ROUNDS_TO_WIN) {
            matchWinner = 'p2';
            this.matchOver = true;
        } else if (this.currentRound >= this.MAX_ROUNDS) {
            // Max rounds reached, determine by points
            if (this.p1RoundsWon > this.p2RoundsWon) matchWinner = 'p1';
            else if (this.p2RoundsWon > this.p1RoundsWon) matchWinner = 'p2';
            else matchWinner = 'draw';
            this.matchOver = true;
        }

        if (this.matchOver && this.onMatchEnd) {
            this.onMatchEnd(matchWinner as 'p1' | 'p2' | 'draw');
        } else if (!this.matchOver && this.scene) {
            // Start next round
            this.scene.time.delayedCall(2500, () => {
                this.resetForNextRound();
            });
        }
    }

    public resetForNextRound() {
        this.currentRound++;
        this.roundTimer = 99;
        this.roundOver = false;

        // Reset fighters
        this.p1.fState.hp = this.p1.fState.maxHp;
        this.p2.fState.hp = this.p2.fState.maxHp;

        this.p1.setPosition(this.config.p1StartX, this.config.p1StartY);
        this.p2.setPosition(this.config.p2StartX, this.config.p2StartY);

        this.p1.setVelocity(0, 0);
        this.p2.setVelocity(0, 0);

        this.p1.fState.current = 'IDLE';
        this.p2.fState.current = 'IDLE';
        this.p1.clearTint();
        this.p2.clearTint();

        this.p1.resetCombo();
        this.p2.resetCombo();

        this.p1.resetBurstMeter();
        this.p2.resetBurstMeter();
        this.p1.resetStaleMoves();
        this.p2.resetStaleMoves();

        this.p1.fState.invincible = false;
        this.p2.fState.invincible = false;

        this.p1.fState.hitstunRemaining = 0;
        this.p2.fState.hitstunRemaining = 0;

        this.p1.fState.canTechRecover = false;
        this.p2.fState.canTechRecover = false;

        if (this.onRoundStart) {
            this.onRoundStart();
        }
    }

    public resetMatchState() {
        this.p1RoundsWon = 0;
        this.p2RoundsWon = 0;
        this.currentRound = 1;
        this.roundTimer = 99;
        this.roundOver = false;
        this.matchOver = false;
    }
}
