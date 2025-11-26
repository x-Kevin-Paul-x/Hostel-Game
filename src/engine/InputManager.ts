import Phaser from 'phaser';

export type InputMap = {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    punch: boolean;
    jab: boolean;
    kick: boolean;
    block: boolean;
    duck: boolean;
};

export class InputManager {
    private scene: Phaser.Scene;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd?: {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
    };
    private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        if (this.scene.input.keyboard) {
            this.cursors = this.scene.input.keyboard.createCursorKeys();
            this.wasd = this.scene.input.keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
            }) as any;

            this.keys.F = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
            this.keys.G = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
            this.keys.K = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
            this.keys.L = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
            this.keys.E = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.keys.H = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
            this.keys.Q = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q); // P1 Block
            this.keys.U = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U); // P2 Block
        }
    }

    getP1Input(): InputMap {
        if (!this.wasd) return this.getEmptyInput();

        return {
            left: this.wasd.left.isDown,
            right: this.wasd.right.isDown,
            up: this.wasd.up.isDown,
            down: this.wasd.down.isDown,
            jump: this.wasd.up.isDown, // Simplified jump mapping
            punch: this.keys.F.isDown,
            jab: this.keys.E.isDown,
            kick: this.keys.G.isDown,
            block: this.keys.Q.isDown, // Q for block
            duck: this.wasd.down.isDown, // S for duck
        };
    }

    getP2Input(): InputMap {
        if (!this.cursors) return this.getEmptyInput();

        return {
            left: this.cursors.left.isDown,
            right: this.cursors.right.isDown,
            up: this.cursors.up.isDown,
            down: this.cursors.down.isDown,
            jump: this.cursors.up.isDown,
            punch: this.keys.K.isDown,
            jab: this.keys.H.isDown,
            kick: this.keys.L.isDown,
            block: this.keys.U.isDown, // U for block
            duck: this.cursors.down.isDown, // Down arrow for duck
        };
    }

    private getEmptyInput(): InputMap {
        return { left: false, right: false, up: false, down: false, jump: false, punch: false, jab: false, kick: false, block: false, duck: false };
    }
}
