import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    private p1Character: string = 'Kevin';
    private p2Character: string = 'Noel';
    private isVsAI: boolean = false;

    constructor() {
        super('BootScene');
    }

    init(data: { p1Character?: string; p2Character?: string; isVsAI?: boolean }) {
        // Accept character selections from CharacterSelectScene
        this.p1Character = data?.p1Character || 'Kevin';
        this.p2Character = data?.p2Character || 'Noel';
        this.isVsAI = data?.isVsAI || false;
    }

    preload() {
        this.load.json('character-manifest', '/character-manifest.json');
        // Background video instead of image
        this.load.video('backgroundVideo', '/Assets/Backgrounds/Video Project 1.mp4');
        // Fight music
        this.load.audio('fightMusic', '/Assets/Background Song/Fight Scene Songs/Final Round Fury.mp3');

        // Round title assets for 1V1 mode
        this.load.image('round1', '/Assets/Round Title/round 1.png');
        this.load.image('round2', '/Assets/Round Title/round 2.png');
        this.load.image('round3', '/Assets/Round Title/round 3.png');
        this.load.image('fightSplash', '/Assets/Round Title/FIGHT splash.png');
    }

    create() {
        const manifest = this.cache.json.get('character-manifest');
        if (manifest && manifest.characters) {
            // expose manifest to other scenes via registry so they can read per-character settings
            this.registry.set('character-manifest', manifest);
            manifest.characters.forEach((char: any) => {
                console.log(`Loading character: ${char.name}`);

                // Load Idle
                // Load Idle (single image or frames)
                if (char.idleFrames && char.idleFrames.length > 0) {
                    char.idleFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_idle_${index}`, frame);
                    });
                } else if (char.idleFrame) {
                    this.load.image(`${char.name}_idle`, char.idleFrame);
                }

                // Load Walk Frames
                if (char.walkFrames && char.walkFrames.length > 0) {
                    char.walkFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_walk_${index}`, frame);
                    });
                }

                // Load Jab Frames (if provided)
                if (char.jabFrames && char.jabFrames.length > 0) {
                    char.jabFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_jab_${index}`, frame);
                    });
                }

                // Load Duck Frames (if provided)
                if (char.duckFrames && char.duckFrames.length > 0) {
                    char.duckFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_duck_${index}`, frame);
                    });
                }

                // Load Jump Frames (if provided)
                if (char.jumpFrames && char.jumpFrames.length > 0) {
                    char.jumpFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_jump_${index}`, frame);
                    });
                }

                // Load Block Frames (if provided)
                if (char.blockFrames && char.blockFrames.length > 0) {
                    char.blockFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_block_${index}`, frame);
                    });
                }
            });

            this.load.start();
        }

        this.load.once('complete', () => {
            this.scene.start('BattleScene', {
                p1Character: this.p1Character,
                p2Character: this.p2Character,
                isVsAI: this.isVsAI
            });
        });

        if (this.load.totalToLoad === 0) {
            this.scene.start('BattleScene', {
                p1Character: this.p1Character,
                p2Character: this.p2Character,
                isVsAI: this.isVsAI
            });
        }
    }
}

