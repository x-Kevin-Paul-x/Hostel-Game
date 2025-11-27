import Phaser from 'phaser';
import { SettingsManager } from '../utils/SettingsManager';

export class SettingsScene extends Phaser.Scene {
    private settings: SettingsManager;
    private settingsContainer!: Phaser.GameObjects.Container;
    private calledFrom: string = 'TitleScene';
    private sliderRefs: Map<string, { handle: Phaser.GameObjects.Rectangle, fill: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text }> = new Map();

    constructor() {
        super('SettingsScene');
        this.settings = SettingsManager.getInstance();
    }

    init(data: { calledFrom?: string }) {
        this.calledFrom = data?.calledFrom || 'TitleScene';
    }

    create() {
        const { width, height } = this.scale;

        // Semi-transparent dark overlay with blur effect simulation
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
        overlay.setInteractive(); // Block clicks through

        // Create main container
        this.settingsContainer = this.add.container(width / 2, height / 2);

        const panelWidth = 600;
        const panelHeight = 520;

        // Create retro panel
        this.createRetroPanel(panelWidth, panelHeight);

        // Settings sections
        const startY = -140;
        const spacing = 70;

        // === AUDIO SECTION ===
        this.createSectionHeader('AUDIO', startY - 40);
        
        // Show context-aware music slider based on which scene we came from
        if (this.calledFrom === 'BattleScene') {
            // Fight music settings
            this.createVolumeSlider('FIGHT MUSIC', startY, 'fightMusicVolume', 
                this.settings.get('fightMusicVolume'), 
                this.settings.get('fightMusicEnabled'),
                (value) => {
                    this.settings.set('fightMusicVolume', value);
                    this.registry.set('fightMusicVolume', value);
                    this.updateFightMusicVolume();
                },
                (enabled) => {
                    this.settings.set('fightMusicEnabled', enabled);
                    this.registry.set('fightMusicEnabled', enabled);
                    this.updateFightMusicVolume();
                }
            );
        } else {
            // Title music settings
            this.createVolumeSlider('TITLE MUSIC', startY, 'titleMusicVolume', 
                this.settings.get('titleMusicVolume'), 
                this.settings.get('titleMusicEnabled'),
                (value) => {
                    this.settings.set('titleMusicVolume', value);
                    this.registry.set('titleMusicVolume', value);
                    this.updateTitleMusicVolume();
                },
                (enabled) => {
                    this.settings.set('titleMusicEnabled', enabled);
                    this.registry.set('titleMusicEnabled', enabled);
                    this.updateTitleMusicVolume();
                }
            );
        }

        this.createVolumeSlider('SFX VOL', startY + spacing, 'sfxVolume',
            this.settings.get('sfxVolume'),
            this.settings.get('sfxEnabled'),
            (value) => {
                this.settings.set('sfxVolume', value);
                this.registry.set('sfxVolume', value);
            },
            (enabled) => {
                this.settings.set('sfxEnabled', enabled);
                this.registry.set('sfxEnabled', enabled);
            }
        );

        // === DISPLAY SECTION ===
        this.createSectionHeader('DISPLAY', startY + spacing * 2 - 10);

        this.createToggleOption('FULLSCREEN', startY + spacing * 2 + 30, this.scale.isFullscreen, (enabled) => {
            if (enabled) {
                this.scale.startFullscreen();
            } else {
                this.scale.stopFullscreen();
            }
        });

        this.createToggleOption('SCREEN SHAKE', startY + spacing * 3, this.settings.get('screenShake'), (enabled) => {
            this.settings.set('screenShake', enabled);
            this.registry.set('screenShake', enabled);
        });

        // === BUTTONS ===
        const buttonY = panelHeight / 2 - 70;
        
        // Reset Defaults Button
        const resetBtn = this.createRetroButton(-100, buttonY, 'RESET', 0xaa4444, () => {
            this.settings.reset();
            // update registry to match reset settings so other scenes pick up defaults
            const all = this.settings.getAll();
            this.registry.set('titleMusicVolume', all.titleMusicVolume);
            this.registry.set('titleMusicEnabled', all.titleMusicEnabled);
            this.registry.set('fightMusicVolume', all.fightMusicVolume);
            this.registry.set('fightMusicEnabled', all.fightMusicEnabled);
            this.registry.set('sfxVolume', all.sfxVolume);
            this.registry.set('sfxEnabled', all.sfxEnabled);
            this.registry.set('screenShake', all.screenShake);

            this.scene.restart({ calledFrom: this.calledFrom });
        });
        this.settingsContainer.add(resetBtn);

        // Back Button
        const backBtn = this.createRetroButton(100, buttonY, 'BACK', 0x44aa44, () => {
            this.closeSettings();
        });
        this.settingsContainer.add(backBtn);

        // Animate entrance
        this.settingsContainer.setScale(0.8);
        this.settingsContainer.setAlpha(0);
        this.tweens.add({
            targets: this.settingsContainer,
            scale: 1,
            alpha: 1,
            duration: 250,
            ease: 'Back.easeOut'
        });

        // ESC to close
        this.input.keyboard?.on('keydown-ESC', () => {
            this.closeSettings();
        });
    }

    private createRetroPanel(panelWidth: number, panelHeight: number) {
        // Outer glow/shadow
        const shadow = this.add.rectangle(4, 4, panelWidth + 12, panelHeight + 12, 0x000000, 0.5);
        
        // Main outer frame
        const outerFrame = this.add.rectangle(0, 0, panelWidth + 12, panelHeight + 12, 0x0a0a1a);
        
        // Metallic border effect
        const borderTop = this.add.rectangle(0, -panelHeight/2 - 4, panelWidth + 8, 4, 0x8a8aaa);
        const borderLeft = this.add.rectangle(-panelWidth/2 - 4, 0, 4, panelHeight + 8, 0x8a8aaa);
        const borderBottom = this.add.rectangle(0, panelHeight/2 + 4, panelWidth + 8, 4, 0x3a3a5a);
        const borderRight = this.add.rectangle(panelWidth/2 + 4, 0, 4, panelHeight + 8, 0x3a3a5a);

        // Inner panel with gradient simulation
        const innerPanel = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x1e1e36);
        
        // Top highlight
        const topHighlight = this.add.rectangle(0, -panelHeight/2 + 40, panelWidth - 20, 80, 0x2a2a4a);
        
        // Decorative corners
        const cornerSize = 16;
        const cornerColor = 0xffcc00;
        const corners = [
            // Top left
            this.add.rectangle(-panelWidth/2 + cornerSize/2 + 4, -panelHeight/2 + cornerSize/2 + 4, cornerSize, cornerSize, cornerColor),
            this.add.rectangle(-panelWidth/2 + cornerSize/2 + 4, -panelHeight/2 + cornerSize + 10, cornerSize/2, cornerSize/2, cornerColor),
            this.add.rectangle(-panelWidth/2 + cornerSize + 10, -panelHeight/2 + cornerSize/2 + 4, cornerSize/2, cornerSize/2, cornerColor),
            // Top right
            this.add.rectangle(panelWidth/2 - cornerSize/2 - 4, -panelHeight/2 + cornerSize/2 + 4, cornerSize, cornerSize, cornerColor),
            this.add.rectangle(panelWidth/2 - cornerSize/2 - 4, -panelHeight/2 + cornerSize + 10, cornerSize/2, cornerSize/2, cornerColor),
            this.add.rectangle(panelWidth/2 - cornerSize - 10, -panelHeight/2 + cornerSize/2 + 4, cornerSize/2, cornerSize/2, cornerColor),
            // Bottom left
            this.add.rectangle(-panelWidth/2 + cornerSize/2 + 4, panelHeight/2 - cornerSize/2 - 4, cornerSize, cornerSize, cornerColor),
            // Bottom right
            this.add.rectangle(panelWidth/2 - cornerSize/2 - 4, panelHeight/2 - cornerSize/2 - 4, cornerSize, cornerSize, cornerColor),
        ];

        // Title bar background
        const titleBar = this.add.rectangle(0, -panelHeight/2 + 35, panelWidth - 40, 50, 0x0d0d1a);
        titleBar.setStrokeStyle(2, 0xffcc00);

        // Title text
        const title = this.add.text(0, -panelHeight/2 + 35, '⚙  SETTINGS  ⚙', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '24px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Decorative line
        const titleLine = this.add.graphics();
        titleLine.lineStyle(2, 0xffcc00);
        titleLine.lineBetween(-panelWidth/2 + 30, -panelHeight/2 + 65, panelWidth/2 - 30, -panelHeight/2 + 65);
        
        // Small pixel accents
        titleLine.fillStyle(0xffcc00);
        titleLine.fillRect(-panelWidth/2 + 25, -panelHeight/2 + 63, 6, 6);
        titleLine.fillRect(panelWidth/2 - 31, -panelHeight/2 + 63, 6, 6);

        this.settingsContainer.add([shadow, outerFrame, borderTop, borderLeft, borderBottom, borderRight, 
            innerPanel, topHighlight, ...corners, titleBar, title, titleLine]);
    }

    private createSectionHeader(text: string, yPos: number) {
        const bg = this.add.rectangle(0, yPos, 200, 24, 0x2a2a4a);
        bg.setStrokeStyle(1, 0x4a4a6a);
        
        const label = this.add.text(0, yPos, text, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#8a8aaa',
        }).setOrigin(0.5);

        this.settingsContainer.add([bg, label]);
    }

    private createVolumeSlider(
        label: string,
        yPos: number,
        key: string,
        initialValue: number,
        enabled: boolean,
        onVolumeChange: (value: number) => void,
        onToggle: (enabled: boolean) => void
    ) {
        const sliderWidth = 220;
        const sliderHeight = 24;

        // Label with icon
        const labelText = this.add.text(-250, yPos, label, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '11px',
            color: '#ffffff',
        }).setOrigin(0, 0.5);

        // Slider container background
        const sliderBg = this.add.rectangle(0, yPos, sliderWidth + 8, sliderHeight + 8, 0x0a0a1a);
        sliderBg.setStrokeStyle(2, 0x3a3a5a);

        // Slider track
        const sliderTrack = this.add.rectangle(0, yPos, sliderWidth, sliderHeight, 0x1a1a2e);
        
        // Slider fill (gradient effect with multiple rects)
        const fillWidth = sliderWidth * initialValue;
        const sliderFill = this.add.rectangle(
            -sliderWidth/2 + fillWidth/2,
            yPos,
            fillWidth,
            sliderHeight - 4,
            0xffcc00
        );
        
        // Fill highlight
        const fillHighlight = this.add.rectangle(
            -sliderWidth/2 + fillWidth/2,
            yPos - 4,
            fillWidth,
            4,
            0xffee88
        );

        // Slider handle
        const handleX = -sliderWidth/2 + sliderWidth * initialValue;
        const sliderHandle = this.add.rectangle(handleX, yPos, 14, sliderHeight + 12, 0xffffff);
        sliderHandle.setStrokeStyle(2, 0x000000);
        sliderHandle.setInteractive({ useHandCursor: true, draggable: true });

        // Volume percentage text
        const volumeText = this.add.text(sliderWidth/2 + 45, yPos, `${Math.round(initialValue * 100)}%`, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '10px',
            color: '#ffcc00',
        }).setOrigin(0.5);

        // Toggle button
        let isEnabled = enabled;
        const toggleBg = this.add.rectangle(200, yPos, 50, 28, isEnabled ? 0x44aa44 : 0xaa4444);
        toggleBg.setStrokeStyle(2, 0xffffff);
        toggleBg.setInteractive({ useHandCursor: true });

        const toggleText = this.add.text(200, yPos, isEnabled ? 'ON' : 'OFF', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Store refs for updating
        this.sliderRefs.set(key, { handle: sliderHandle, fill: sliderFill, text: volumeText });

        // Toggle interaction
        toggleBg.on('pointerdown', () => {
            isEnabled = !isEnabled;
            toggleBg.setFillStyle(isEnabled ? 0x44aa44 : 0xaa4444);
            toggleText.setText(isEnabled ? 'ON' : 'OFF');
            onToggle(isEnabled);
            this.playClickSound();
        });

        toggleBg.on('pointerover', () => toggleBg.setStrokeStyle(3, 0xffcc00));
        toggleBg.on('pointerout', () => toggleBg.setStrokeStyle(2, 0xffffff));

        // Slider track interaction
        sliderTrack.setInteractive({ useHandCursor: true });
        sliderTrack.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const localX = pointer.x - this.settingsContainer.x;
            const newValue = Phaser.Math.Clamp((localX + sliderWidth/2) / sliderWidth, 0, 1);
            this.updateSliderVisual(key, sliderWidth, newValue);
            onVolumeChange(newValue);
            this.playClickSound();
        });

        // Drag handling
        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Rectangle, dragX: number) => {
            if (gameObject === sliderHandle) {
                const newX = Phaser.Math.Clamp(dragX, -sliderWidth/2, sliderWidth/2);
                const newValue = (newX + sliderWidth/2) / sliderWidth;
                this.updateSliderVisual(key, sliderWidth, newValue);
                onVolumeChange(newValue);
            }
        });

        this.settingsContainer.add([labelText, sliderBg, sliderTrack, sliderFill, fillHighlight, sliderHandle, volumeText, toggleBg, toggleText]);
    }

    private updateSliderVisual(key: string, sliderWidth: number, value: number) {
        const refs = this.sliderRefs.get(key);
        if (refs) {
            const fillWidth = sliderWidth * value;
            refs.handle.x = -sliderWidth/2 + sliderWidth * value;
            refs.fill.x = -sliderWidth/2 + fillWidth/2;
            refs.fill.width = Math.max(fillWidth, 1);
            refs.text.setText(`${Math.round(value * 100)}%`);
        }
    }

    private createToggleOption(label: string, yPos: number, initialValue: boolean, onToggle: (enabled: boolean) => void) {
        const labelText = this.add.text(-250, yPos, label, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '11px',
            color: '#ffffff',
        }).setOrigin(0, 0.5);

        let isEnabled = initialValue;
        const toggleWidth = 100;
        const toggleHeight = 30;

        // Toggle track
        const toggleTrack = this.add.rectangle(50, yPos, toggleWidth, toggleHeight, 0x0a0a1a);
        toggleTrack.setStrokeStyle(2, 0x3a3a5a);
        toggleTrack.setInteractive({ useHandCursor: true });

        // Toggle indicator
        const indicatorX = isEnabled ? 50 + toggleWidth/4 : 50 - toggleWidth/4;
        const toggleIndicator = this.add.rectangle(indicatorX, yPos, toggleWidth/2 - 8, toggleHeight - 8, isEnabled ? 0x44aa44 : 0xaa4444);
        toggleIndicator.setStrokeStyle(2, 0xffffff);

        // Status text
        const statusText = this.add.text(50, yPos, isEnabled ? 'ON' : 'OFF', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '10px',
            color: '#ffffff',
        }).setOrigin(0.5);

        toggleTrack.on('pointerdown', () => {
            isEnabled = !isEnabled;
            
            this.tweens.add({
                targets: toggleIndicator,
                x: isEnabled ? 50 + toggleWidth/4 : 50 - toggleWidth/4,
                duration: 100,
                ease: 'Power2'
            });
            
            toggleIndicator.setFillStyle(isEnabled ? 0x44aa44 : 0xaa4444);
            statusText.setText(isEnabled ? 'ON' : 'OFF');
            onToggle(isEnabled);
            this.playClickSound();
        });

        toggleTrack.on('pointerover', () => toggleTrack.setStrokeStyle(3, 0xffcc00));
        toggleTrack.on('pointerout', () => toggleTrack.setStrokeStyle(2, 0x3a3a5a));

        this.settingsContainer.add([labelText, toggleTrack, toggleIndicator, statusText]);
    }

    private createRetroButton(x: number, y: number, text: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
        const btnContainer = this.add.container(x, y);
        const btnWidth = 140;
        const btnHeight = 45;

        // Shadow
        const shadow = this.add.rectangle(3, 3, btnWidth, btnHeight, 0x000000, 0.5);
        
        // Button body
        const body = this.add.rectangle(0, 0, btnWidth, btnHeight, color);
        body.setStrokeStyle(3, 0xffffff);
        body.setInteractive({ useHandCursor: true });

        // Highlight
        const highlight = this.add.rectangle(0, -btnHeight/4, btnWidth - 8, btnHeight/3, 0xffffff, 0.2);

        // Text
        const btnText = this.add.text(0, 0, text, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '12px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);

        body.on('pointerover', () => {
            body.setStrokeStyle(3, 0xffcc00);
            this.tweens.add({ targets: btnContainer, scale: 1.05, duration: 100 });
        });

        body.on('pointerout', () => {
            body.setStrokeStyle(3, 0xffffff);
            this.tweens.add({ targets: btnContainer, scale: 1, duration: 100 });
        });

        body.on('pointerdown', () => {
            this.tweens.add({
                targets: btnContainer,
                scale: 0.95,
                duration: 50,
                yoyo: true,
                onComplete: () => {
                    this.playClickSound();
                    onClick();
                }
            });
        });

        btnContainer.add([shadow, body, highlight, btnText]);
        return btnContainer;
    }

    private playClickSound() {
        if (!this.settings.get('sfxEnabled')) return;
        
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'square';
            
            const volume = this.settings.get('sfxVolume') * 0.15;
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.08);
        } catch (e) {
            // Silently fail
        }
    }

    private updateTitleMusicVolume() {
        const bgMusic = this.sound.get('bgMusic');
        if (bgMusic) {
            if (this.settings.get('titleMusicEnabled')) {
                (bgMusic as Phaser.Sound.WebAudioSound).setVolume(this.settings.get('titleMusicVolume'));
                if (!bgMusic.isPlaying) {
                    bgMusic.play();
                }
            } else {
                bgMusic.pause();
            }
        }
    }

    private updateFightMusicVolume() {
        const fightMusic = this.sound.get('fightMusic');
        if (fightMusic) {
            if (this.settings.get('fightMusicEnabled')) {
                (fightMusic as Phaser.Sound.WebAudioSound).setVolume(this.settings.get('fightMusicVolume'));
                if (!fightMusic.isPlaying) {
                    fightMusic.play();
                }
            } else {
                fightMusic.pause();
            }
        }
    }

    private closeSettings() {
        this.tweens.add({
            targets: this.settingsContainer,
            scale: 0.8,
            alpha: 0,
            duration: 150,
            ease: 'Back.easeIn',
            onComplete: () => {
                this.scene.stop();
                this.scene.resume(this.calledFrom);
            }
        });
    }
}