import Phaser from 'phaser';
import './style.css';
import { TitleScene } from './scenes/TitleScene';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { SettingsScene } from './scenes/SettingsScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.RESIZE,
        parent: 'app',
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    audio: {
        disableWebAudio: false,
    },
    pauseOnBlur: false, // Keep audio/video playing when tab loses focus
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 500 },
            debug: true,
        },
    },
    scene: [TitleScene, BootScene, BattleScene, SettingsScene],
};

new Phaser.Game(config);
