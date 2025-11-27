import Phaser from 'phaser';
import { SettingsManager } from '../utils/SettingsManager';

export class TitleScene extends Phaser.Scene {
    private bgMusic!: Phaser.Sound.BaseSound;
    private menuVideo!: Phaser.GameObjects.Video;
    private audioContext!: AudioContext;
    private audioSource!: MediaElementAudioSourceNode;

    constructor() {
        super('TitleScene');
    }

    preload() {
        // Load background video
        this.load.video('menuVideo', '/Assets/Menu Screen/menu screen.mp4');

        // Load game logo
        this.load.image('gameName', '/Assets/Menu Screen/game name.png');

        // Load buttons
        this.load.image('btn1v1', '/Assets/Button/1v1 button.png');
        this.load.image('btn1v1Hover', '/Assets/Button/1v1_mode hover.png');
        this.load.image('btnStory', '/Assets/Button/story_mode button.png');
        this.load.image('btnStoryHover', '/Assets/Button/story_mode hover.png');
        this.load.image('btnSettings', '/Assets/Button/settings button.png');
        this.load.image('btnSettingsHover', '/Assets/Button/settings hover.png');

        // Load background music
        this.load.audio('bgMusic', '/Assets/Background Song/background music.mp3');
    }

    create() {
        const { width, height } = this.scale;

        // Background Video - loops infinitely and spans entire screen
        this.menuVideo = this.add.video(width / 2, height / 2, 'menuVideo');
        
        // Wait for video to be ready, then set proper dimensions
        this.menuVideo.on('play', () => {
            // Scale video to cover entire screen while maintaining aspect ratio
            const videoWidth = this.menuVideo.width;
            const videoHeight = this.menuVideo.height;
            
            // Calculate scale to cover the entire screen
            const scaleX = width / videoWidth;
            const scaleY = height / videoHeight;
            const scale = Math.max(scaleX, scaleY); // Use max to cover entire screen
            
            this.menuVideo.setScale(scale);
        });
        
        // Set display size as fallback
        this.menuVideo.setDisplaySize(width, height);
        this.menuVideo.setLoop(true);
        
        // Play the video - muted for autoplay policy, then unmute after user interaction
        this.menuVideo.play(true);
        
        // Handle video looping manually as a backup
        this.menuVideo.on('complete', () => {
            this.menuVideo.play(true);
        });

        // Game Logo/Title
        const gameLogo = this.add.image(width / 2, height * 0.22, 'gameName');
        // Scale the logo appropriately
        gameLogo.setScale(Math.min(0.8, (width * 0.6) / gameLogo.width));

        // Subtle floating animation for logo
        this.tweens.add({
            targets: gameLogo,
            y: gameLogo.y - 10,
            duration: 1500,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Button spacing
        const buttonStartY = height * 0.5;
        const buttonSpacing = 90;

        // 1v1 Mode Button
        const btn1v1 = this.add.image(width / 2, buttonStartY, 'btn1v1')
            .setInteractive({ useHandCursor: true })
            .setScale(0.5);

        btn1v1.on('pointerover', () => {
            btn1v1.setTexture('btn1v1Hover');
            this.tweens.add({
                targets: btn1v1,
                scale: 0.55,
                duration: 100,
                ease: 'Power2'
            });
        });

        btn1v1.on('pointerout', () => {
            btn1v1.setTexture('btn1v1');
            this.tweens.add({
                targets: btn1v1,
                scale: 0.5,
                duration: 100,
                ease: 'Power2'
            });
        });

        btn1v1.on('pointerdown', () => {
            this.startGame();
        });

        // Story Mode Button
        const btnStory = this.add.image(width / 2, buttonStartY + buttonSpacing, 'btnStory')
            .setInteractive({ useHandCursor: true })
            .setScale(0.5);

        btnStory.on('pointerover', () => {
            btnStory.setTexture('btnStoryHover');
            this.tweens.add({
                targets: btnStory,
                scale: 0.55,
                duration: 100,
                ease: 'Power2'
            });
        });

        btnStory.on('pointerout', () => {
            btnStory.setTexture('btnStory');
            this.tweens.add({
                targets: btnStory,
                scale: 0.5,
                duration: 100,
                ease: 'Power2'
            });
        });

        btnStory.on('pointerdown', () => {
            // Story mode - for now, just start the game
            // You can implement a story scene later
            this.startGame();
        });

        // Settings Button
        const btnSettings = this.add.image(width / 2, buttonStartY + buttonSpacing * 2, 'btnSettings')
            .setInteractive({ useHandCursor: true })
            .setScale(0.5);

        btnSettings.on('pointerover', () => {
            btnSettings.setTexture('btnSettingsHover');
            this.tweens.add({
                targets: btnSettings,
                scale: 0.55,
                duration: 100,
                ease: 'Power2'
            });
        });

        btnSettings.on('pointerout', () => {
            btnSettings.setTexture('btnSettings');
            this.tweens.add({
                targets: btnSettings,
                scale: 0.5,
                duration: 100,
                ease: 'Power2'
            });
        });

        btnSettings.on('pointerdown', () => {
            // Open settings scene as overlay
            this.scene.pause();
            this.scene.launch('SettingsScene');
        });

        // Initialize registry from persisted SettingsManager so saved preferences persist
        const settings = SettingsManager.getInstance();
        this.registry.set('titleMusicVolume', settings.get('titleMusicVolume'));
        this.registry.set('titleMusicEnabled', settings.get('titleMusicEnabled'));
        this.registry.set('fightMusicVolume', settings.get('fightMusicVolume'));
        this.registry.set('fightMusicEnabled', settings.get('fightMusicEnabled'));
        this.registry.set('sfxVolume', settings.get('sfxVolume'));
        this.registry.set('sfxEnabled', settings.get('sfxEnabled'));
        this.registry.set('screenShake', settings.get('screenShake'));

        // Stop any fight music that might be playing
        const fightMusic = this.sound.get('fightMusic');
        if (fightMusic && fightMusic.isPlaying) {
            fightMusic.stop();
        }

        // Background Music - use existing or create new (respect persisted title music settings)
        const existingMusic = this.sound.get('bgMusic');
        const volume = settings.get('titleMusicVolume') ?? 0.5;
        const enabled = settings.get('titleMusicEnabled') ?? true;
        if (existingMusic) {
            this.bgMusic = existingMusic;
            (this.bgMusic as Phaser.Sound.WebAudioSound).setVolume(volume);
            if (enabled && !this.bgMusic.isPlaying) {
                this.bgMusic.play();
            }
        } else {
            this.bgMusic = this.sound.add('bgMusic', {
                loop: true,
                volume: volume
            });
            if (enabled) {
                this.bgMusic.play();
            }
        }

        // Setup Media Session API for background audio persistence
        this.setupMediaSession();

        // Listen for title music settings changes
        this.registry.events.on('changedata-titleMusicVolume', (_: any, value: number) => {
            if (this.bgMusic) {
                (this.bgMusic as Phaser.Sound.WebAudioSound).setVolume(value);
            }
        });

        this.registry.events.on('changedata-titleMusicEnabled', (_: any, enabled: boolean) => {
            if (this.bgMusic) {
                if (enabled) {
                    if (!this.bgMusic.isPlaying) {
                        this.bgMusic.play();
                    }
                } else {
                    this.bgMusic.pause();
                }
            }
        });

        // Keyboard shortcut - Press Enter or Space to start 1v1
        this.input.keyboard?.on('keydown-SPACE', () => {
            this.startGame();
        });
        this.input.keyboard?.on('keydown-ENTER', () => {
            this.startGame();
        });
    }

    private setupMediaSession() {
        // Media Session API - helps browser allow background audio
        if ('mediaSession' in navigator) {
            // Set metadata for the media session
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Hostel Fighter',
                artist: 'Game Soundtrack',
                album: 'Hostel Fighter OST',
                artwork: [
                    { src: '/Assets/Menu Screen/game name.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            // Set playback state
            navigator.mediaSession.playbackState = 'playing';

            // Handle play/pause from OS media controls
            navigator.mediaSession.setActionHandler('play', () => {
                if (this.bgMusic && !this.bgMusic.isPlaying) {
                    this.bgMusic.play();
                    navigator.mediaSession.playbackState = 'playing';
                }
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                if (this.bgMusic && this.bgMusic.isPlaying) {
                    this.bgMusic.pause();
                    navigator.mediaSession.playbackState = 'paused';
                }
            });

            // Handle stop
            navigator.mediaSession.setActionHandler('stop', () => {
                if (this.bgMusic) {
                    this.bgMusic.stop();
                    navigator.mediaSession.playbackState = 'none';
                }
            });

            // Optional: Handle seeking (not really needed for looping music)
            navigator.mediaSession.setActionHandler('seekbackward', null);
            navigator.mediaSession.setActionHandler('seekforward', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);

            console.log('Media Session API initialized for background audio');
        }
    }

    private startGame() {
        // Fade out music
        if (this.bgMusic && this.bgMusic.isPlaying) {
            this.tweens.add({
                targets: this.bgMusic,
                volume: 0,
                duration: 500
            });
        }

        // Stop video
        if (this.menuVideo) {
            this.menuVideo.stop();
        }

        // Camera fade and transition
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('BootScene');
        });
    }
}
