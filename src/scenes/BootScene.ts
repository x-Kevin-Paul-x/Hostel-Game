import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        this.load.json('character-manifest', '/character-manifest.json');
        this.load.image('background', '/Assets/Environment/background.png');
        this.load.image('floor', '/Assets/Environment/floor.png');
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
            this.scene.start('BattleScene');
        });

        if (this.load.totalToLoad === 0) {
            this.scene.start('BattleScene');
        }
    }
}
