import Phaser from 'phaser';

interface CharacterData {
    name: string;
    path: string;
    idleFrames?: string[];
    isPlayable: boolean;
    portraitKey?: string;
}

export class CharacterSelectScene extends Phaser.Scene {
    private characters: CharacterData[] = [];
    private p1Selection: string | null = null;
    private p2Selection: string | null = null;
    private isVsAI: boolean = false;
    private modeText!: Phaser.GameObjects.Text;
    private p1Preview!: Phaser.GameObjects.Container;
    private p2Preview!: Phaser.GameObjects.Container;
    private fightButton!: Phaser.GameObjects.Container;
    private characterSlots: Map<string, Phaser.GameObjects.Container> = new Map();

    // Playable characters (those with full implementation)
    private readonly PLAYABLE_CHARACTERS = ['Kevin', 'Noel'];

    // Portrait paths for playable characters
    private readonly PORTRAIT_PATHS: { [key: string]: string } = {
        'Kevin': '/Assets/Character/Kevin/Portrait.png',
        'Noel': '/Assets/Character/Noel/Portrait.jpeg'
    };

    constructor() {
        super('CharacterSelectScene');
    }

    preload() {
        // Load character manifest
        this.load.json('characterManifest', '/character-manifest.json');

        // Load character portraits
        Object.entries(this.PORTRAIT_PATHS).forEach(([name, path]) => {
            this.load.image(`portrait_${name}`, path);
        });
    }

    create() {
        const { width, height } = this.scale;

        // Dark background
        this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a);

        // Load manifest and build character list
        this.loadCharacters();

        // Title
        this.add.text(width / 2, 50, 'SELECT YOUR FIGHTERS', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '24px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // VS Mode toggle (Tab key)
        this.modeText = this.add.text(width / 2, 90, 'VS PLAYER', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#44ff44',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        const modeHint = this.add.text(width / 2, 110, '[TAB] to toggle', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: '#888888'
        }).setOrigin(0.5);

        // Tab key to toggle mode
        this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.isVsAI = !this.isVsAI;
            this.modeText.setText(this.isVsAI ? 'VS AI' : 'VS PLAYER');
            this.modeText.setColor(this.isVsAI ? '#ff8844' : '#44ff44');

            // In AI mode, auto-select P2 if P1 is selected
            if (this.isVsAI && this.p1Selection && !this.p2Selection) {
                this.autoSelectP2();
            }
            // Clear P2 selection when switching to player mode
            if (!this.isVsAI && this.p2Selection) {
                this.clearSelection(2);
            }
            this.updateFightButton();
        });

        // Create preview areas
        this.createPreviewAreas(width, height);

        // Create character grid
        this.createCharacterGrid(width, height);

        // Create buttons
        this.createButtons(width, height);
    }

    private loadCharacters() {
        const manifest = this.cache.json.get('characterManifest');

        // All potential characters from Assets folder
        const allCharacters = [
            'Kevin', 'Noel', 'Abdul', 'Advait', 'Ali', 'Fadil',
            'Georgie', 'Laurren', 'Naren', 'Rutvik', 'Soham', 'Vasanth'
        ];

        // Build character list
        this.characters = allCharacters.map(name => {
            const manifestEntry = manifest?.characters?.find((c: any) => c.name === name);
            return {
                name,
                path: `Assets/Character/${name}`,
                idleFrames: manifestEntry?.idleFrames || [],
                isPlayable: this.PLAYABLE_CHARACTERS.includes(name),
                portraitKey: this.PLAYABLE_CHARACTERS.includes(name) ? `portrait_${name}` : undefined
            };
        });
    }

    private createPreviewAreas(width: number, height: number) {
        const boxSize = 200;
        const boxHeight = 220;

        // P1 Preview (left side)
        this.p1Preview = this.add.container(width * 0.18, height * 0.38);

        // Label ABOVE the box
        const p1Label = this.add.text(0, -boxHeight / 2 - 25, 'PLAYER 1', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#4444ff',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0.5);

        // Box for portrait
        const p1Bg = this.add.rectangle(0, 0, boxSize, boxHeight, 0x1a1a2e);
        p1Bg.setStrokeStyle(3, 0x4444ff);

        // P1 Name to the RIGHT of the portrait box
        const p1CharText = this.add.text(boxSize / 2 + 20, 0, '???', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '16px',
            color: '#ffcc00',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0, 0.5);

        this.p1Preview.add([p1Label, p1Bg, p1CharText]);
        this.p1Preview.setData('charText', p1CharText);
        this.p1Preview.setData('boxSize', { w: boxSize, h: boxHeight });

        // VS Text in the center
        this.add.text(width / 2, height * 0.38, 'VS', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '48px',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 6,
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0.5);

        // P2 Preview (right side)
        this.p2Preview = this.add.container(width * 0.82, height * 0.38);

        // Label ABOVE the box
        const p2Label = this.add.text(0, -boxHeight / 2 - 25, 'PLAYER 2', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ff4444',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0.5);

        // Box for portrait
        const p2Bg = this.add.rectangle(0, 0, boxSize, boxHeight, 0x1a1a2e);
        p2Bg.setStrokeStyle(3, 0xff4444);

        // P2 Name to the LEFT of the portrait box
        const p2CharText = this.add.text(-boxSize / 2 - 20, 0, '???', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '16px',
            color: '#ffcc00',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(1, 0.5);

        this.p2Preview.add([p2Label, p2Bg, p2CharText]);
        this.p2Preview.setData('charText', p2CharText);
        this.p2Preview.setData('boxSize', { w: boxSize, h: boxHeight });
    }

    private createCharacterGrid(width: number, height: number) {
        const gridStartY = height * 0.65;
        const slotSize = 80;
        const spacing = 10;
        const cols = 6;
        const totalWidth = cols * slotSize + (cols - 1) * spacing;
        const startX = (width - totalWidth) / 2 + slotSize / 2;

        this.characters.forEach((char, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * (slotSize + spacing);
            const y = gridStartY + row * (slotSize + spacing);

            const slot = this.createCharacterSlot(x, y, slotSize, char);
            this.characterSlots.set(char.name, slot);
        });
    }

    private createCharacterSlot(x: number, y: number, size: number, char: CharacterData): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        // Background
        const bg = this.add.rectangle(0, 0, size, size, char.isPlayable ? 0x2a2a4e : 0x1a1a2e);
        bg.setStrokeStyle(2, char.isPlayable ? 0xffcc00 : 0x444444);

        container.add([bg]);

        // Grid slots only show name - no portraits here
        // Show initial letter for visual identification
        if (!char.isPlayable) {
            const initial = this.add.text(0, -5, char.name.charAt(0), {
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '24px',
                color: '#444444'
            }).setOrigin(0.5);
            container.add(initial);
        } else {
            const initial = this.add.text(0, -5, char.name.charAt(0), {
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '28px',
                color: '#ffcc00'
            }).setOrigin(0.5);
            container.add(initial);
        }

        // Character name below initial
        const nameText = this.add.text(0, 28, char.name.toUpperCase(), {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '6px',
            color: char.isPlayable ? '#ffffff' : '#666666'
        }).setOrigin(0.5);
        container.add(nameText);

        // Lock overlay for non-playable characters
        if (!char.isPlayable) {
            const lockBg = this.add.rectangle(0, 0, size, size, 0x000000, 0.5);
            const lockIcon = this.add.text(0, -5, '🔒', {
                fontSize: '20px'
            }).setOrigin(0.5);
            container.add([lockBg, lockIcon]);
        } else {
            // Make interactive for playable characters
            bg.setInteractive({ useHandCursor: true });

            bg.on('pointerover', () => {
                if (!this.isSelected(char.name)) {
                    bg.setStrokeStyle(3, 0xffffff);
                }
            });

            bg.on('pointerout', () => {
                if (!this.isSelected(char.name)) {
                    bg.setStrokeStyle(2, 0xffcc00);
                }
            });

            bg.on('pointerdown', () => {
                this.selectCharacter(char.name);
            });
        }

        // Store reference to bg for highlighting
        container.setData('bg', bg);
        container.setData('char', char);

        return container;
    }

    private isSelected(name: string): boolean {
        return this.p1Selection === name || this.p2Selection === name;
    }

    private selectCharacter(name: string) {
        // If already selected by other player, ignore
        if (this.p1Selection === name || this.p2Selection === name) {
            return;
        }

        // Determine which player to assign
        if (!this.p1Selection) {
            this.p1Selection = name;
            this.updateSlotHighlight(name, 'p1');
            this.updatePreview(1, name);

            // In AI mode, auto-select P2
            if (this.isVsAI) {
                this.autoSelectP2();
            }
        } else if (!this.p2Selection && !this.isVsAI) {
            this.p2Selection = name;
            this.updateSlotHighlight(name, 'p2');
            this.updatePreview(2, name);
        }

        this.updateFightButton();
    }

    private autoSelectP2() {
        // Pick a random playable character different from P1
        const available = this.PLAYABLE_CHARACTERS.filter(c => c !== this.p1Selection);
        if (available.length > 0) {
            const randomChar = available[Math.floor(Math.random() * available.length)];
            this.p2Selection = randomChar;
            this.updateSlotHighlight(randomChar, 'p2');
            this.updatePreview(2, randomChar);
        }
    }

    private clearSelection(player: 1 | 2) {
        if (player === 1 && this.p1Selection) {
            this.resetSlotHighlight(this.p1Selection);
            this.p1Selection = null;
            (this.p1Preview.getData('charText') as Phaser.GameObjects.Text).setText('???');
        } else if (player === 2 && this.p2Selection) {
            this.resetSlotHighlight(this.p2Selection);
            this.p2Selection = null;
            (this.p2Preview.getData('charText') as Phaser.GameObjects.Text).setText('???');
        }
    }

    private updateSlotHighlight(name: string, player: 'p1' | 'p2') {
        const slot = this.characterSlots.get(name);
        if (slot) {
            const bg = slot.getData('bg') as Phaser.GameObjects.Rectangle;
            const color = player === 'p1' ? 0x4444ff : 0xff4444;
            bg.setStrokeStyle(4, color);
        }
    }

    private resetSlotHighlight(name: string) {
        const slot = this.characterSlots.get(name);
        if (slot) {
            const bg = slot.getData('bg') as Phaser.GameObjects.Rectangle;
            bg.setStrokeStyle(2, 0xffcc00);
        }
    }

    private updatePreview(player: 1 | 2, name: string) {
        const preview = player === 1 ? this.p1Preview : this.p2Preview;
        const charText = preview.getData('charText') as Phaser.GameObjects.Text;
        charText.setText(name.toUpperCase());

        // Update portrait in preview
        const portraitKey = `portrait_${name}`;
        const existingPortrait = preview.getData('portrait') as Phaser.GameObjects.Image;

        // Remove old portrait if exists
        if (existingPortrait) {
            existingPortrait.destroy();
        }

        // Add new portrait - scale to HEIGHT and CROP width with mask
        if (this.textures.exists(portraitKey)) {
            const boxSize = preview.getData('boxSize') as { w: number; h: number };
            const portrait = this.add.image(0, 0, portraitKey);
            // Scale by HEIGHT only - will crop width
            const scale = (boxSize?.h || 220) / portrait.height;
            portrait.setScale(scale);

            // Create mask to crop the portrait to box bounds
            const previewPos = { x: preview.x, y: preview.y };
            const maskShape = this.make.graphics({});
            maskShape.fillStyle(0xffffff);
            maskShape.fillRect(
                previewPos.x - (boxSize?.w || 200) / 2,
                previewPos.y - (boxSize?.h || 220) / 2,
                boxSize?.w || 200,
                boxSize?.h || 220
            );
            const mask = maskShape.createGeometryMask();
            portrait.setMask(mask);

            preview.add(portrait);
            // Move portrait behind text layer (index 2 is after label and bg)
            preview.moveTo(portrait, 2);
            preview.setData('portrait', portrait);
            preview.setData('portraitMask', maskShape);
        }
    }

    private createButtons(width: number, height: number) {
        const buttonY = height - 60;

        // Back button
        const backBtn = this.createRetroButton(width * 0.25, buttonY, 'BACK', 0xaa4444, () => {
            this.scene.start('TitleScene');
        });

        // Fight button (initially disabled)
        this.fightButton = this.createRetroButton(width * 0.75, buttonY, 'FIGHT!', 0x44aa44, () => {
            if (this.p1Selection && this.p2Selection) {
                this.startBattle();
            }
        });
        this.fightButton.setAlpha(0.5);
    }

    private createRetroButton(x: number, y: number, text: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, 150, 50, color);
        bg.setStrokeStyle(3, 0xffffff);
        bg.setInteractive({ useHandCursor: true });

        const label = this.add.text(0, 0, text, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        container.add([bg, label]);

        bg.on('pointerover', () => {
            bg.setScale(1.05);
        });

        bg.on('pointerout', () => {
            bg.setScale(1);
        });

        bg.on('pointerdown', onClick);

        return container;
    }

    private updateFightButton() {
        const canFight = this.p1Selection && this.p2Selection;
        this.fightButton.setAlpha(canFight ? 1 : 0.5);
    }

    private startBattle() {
        // Transition to boot scene with selected characters
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('BootScene', {
                p1Character: this.p1Selection,
                p2Character: this.p2Selection,
                isVsAI: this.isVsAI
            });
        });
    }
}
