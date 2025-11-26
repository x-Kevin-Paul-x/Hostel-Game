import Phaser from 'phaser';
import './style.css';
import { TitleScene } from './scenes/TitleScene';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
    },
    parent: 'app',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 500 },
            debug: true,
        },
    },
    scene: [TitleScene, BootScene, BattleScene],
};

new Phaser.Game(config);
