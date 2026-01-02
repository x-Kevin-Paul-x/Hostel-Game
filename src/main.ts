import Phaser from 'phaser';
import './style.css';
import { TitleScene } from './scenes/TitleScene';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { SettingsScene } from './scenes/SettingsScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        parent: 'app',
        width: 1280,
        height: 720,
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
    scene: [TitleScene, CharacterSelectScene, BootScene, BattleScene, SettingsScene],
};

new Phaser.Game(config);
