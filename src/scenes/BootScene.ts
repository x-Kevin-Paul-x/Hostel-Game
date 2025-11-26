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
            manifest.characters.forEach((char: any) => {
                console.log(`Loading character: ${char.name}`);

                // Load Idle
                if (char.idleFrame) {
                    this.load.image(`${char.name}_idle`, char.idleFrame);
                }

                // Load Walk Frames
                if (char.walkFrames && char.walkFrames.length > 0) {
                    char.walkFrames.forEach((frame: string, index: number) => {
                        this.load.image(`${char.name}_walk_${index}`, frame);
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
