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

    // Keyboard navigation
    private p1CursorIndex: number = 0;
    private p2CursorIndex: number = 1;
    private selectingForAI: boolean = false; // When true in VS AI mode, P1 is selecting for AI

    // Playable characters (those with full implementation)
    private readonly PLAYABLE_CHARACTERS = ['Kevin', 'Noel'];

    // Portrait paths for playable characters
    private readonly PORTRAIT_PATHS: { [key: string]: string } = {
        'Kevin': '/Assets/Character/Kevin/Portrait.png',
        'Noel': '/Assets/Character/Noel/Portrait.jpeg'
    };

    // Idle frame paths for animations
    private readonly IDLE_FRAMES: { [key: string]: string[] } = {
        'Kevin': Array.from({ length: 26 }, (_, i) => `/Assets/Character/Kevin/Idle/sprite_${String(i).padStart(4, '0')}.png`),
        'Noel': Array.from({ length: 13 }, (_, i) => `/Assets/Character/Noel/Idle/sprite_${String(i).padStart(4, '0')}.png`)
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

        // Load idle animation frames for playable characters
        Object.entries(this.IDLE_FRAMES).forEach(([name, frames]) => {
            frames.forEach((framePath, index) => {
                this.load.image(`${name}_select_idle_${index}`, framePath);
            });
        });
    }

    create() {
        const { width, height } = this.scale;

        // Reset state on entry
        this.p1Selection = null;
        this.p2Selection = null;
        this.selectingForAI = false;
        this.p1CursorIndex = 0;
        this.p2CursorIndex = 1;

        // Dark background
        this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a);

        // Load manifest and build character list
        this.loadCharacters();

        // Create animations for playable characters
        this.createIdleAnimations();

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

        this.add.text(width / 2, 110, '[TAB] to toggle', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color: '#888888'
        }).setOrigin(0.5);

        // Create preview areas
        this.createPreviewAreas(width, height);

        // Create character grid
        this.createCharacterGrid(width, height);

        // Create buttons
        this.createButtons(width, height);

        // Setup keyboard controls
        this.setupKeyboardControls();

        // Update initial cursor display
        this.updateCursorDisplay();
    }

    private createIdleAnimations() {
        // Create animations for each playable character
        Object.entries(this.IDLE_FRAMES).forEach(([name, frames]) => {
            const frameKeys = frames.map((_, index) => ({
                key: `${name}_select_idle_${index}`
            }));

            if (!this.anims.exists(`${name}_select_idle`)) {
                this.anims.create({
                    key: `${name}_select_idle`,
                    frames: frameKeys,
                    frameRate: 12,
                    repeat: -1
                });
            }
        });
    }

    private setupKeyboardControls() {
        // Tab key to toggle mode
        this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.isVsAI = !this.isVsAI;
            this.selectingForAI = false;
            this.modeText.setText(this.isVsAI ? 'VS AI' : 'VS PLAYER');
            this.modeText.setColor(this.isVsAI ? '#ff8844' : '#44ff44');

            // Clear P2 selection when switching modes
            if (this.p2Selection) {
                this.clearSelection(2);
            }
            this.updateFightButton();
            this.updateCursorDisplay();
        });

        // P1 Controls: WASD + Space (select) + Backspace (deselect)
        this.input.keyboard?.on('keydown-W', () => this.moveCursor('p1', 'up'));
        this.input.keyboard?.on('keydown-S', () => this.moveCursor('p1', 'down'));
        this.input.keyboard?.on('keydown-A', () => this.moveCursor('p1', 'left'));
        this.input.keyboard?.on('keydown-D', () => this.moveCursor('p1', 'right'));
        this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
            event.preventDefault();
            this.confirmSelection('p1');
        });
        this.input.keyboard?.on('keydown-BACKSPACE', (event: KeyboardEvent) => {
            event.preventDefault();
            this.handleDeselection('p1');
        });

        // P2 Controls: Arrow keys + Enter (select) + Delete (deselect)
        this.input.keyboard?.on('keydown-UP', () => this.moveCursor('p2', 'up'));
        this.input.keyboard?.on('keydown-DOWN', () => this.moveCursor('p2', 'down'));
        this.input.keyboard?.on('keydown-LEFT', () => this.moveCursor('p2', 'left'));
        this.input.keyboard?.on('keydown-RIGHT', () => this.moveCursor('p2', 'right'));
        this.input.keyboard?.on('keydown-ENTER', () => this.confirmSelection('p2'));
        this.input.keyboard?.on('keydown-DELETE', () => this.handleDeselection('p2'));
    }

    private moveCursor(player: 'p1' | 'p2', direction: 'up' | 'down' | 'left' | 'right') {
        // In VS AI mode, only P1 controls matter
        if (this.isVsAI && player === 'p2') return;

        // Get current cursor index based on context
        let cursorIndex = player === 'p1' ? this.p1CursorIndex : this.p2CursorIndex;

        // In VS AI mode after P1 selected, P1 controls P2's cursor
        if (this.isVsAI && this.selectingForAI && player === 'p1') {
            cursorIndex = this.p2CursorIndex;
        }

        const cols = 6;
        const totalChars = this.characters.length;
        let newIndex = cursorIndex;

        switch (direction) {
            case 'up':
                newIndex = cursorIndex - cols;
                if (newIndex < 0) newIndex = cursorIndex;
                break;
            case 'down':
                newIndex = cursorIndex + cols;
                if (newIndex >= totalChars) newIndex = cursorIndex;
                break;
            case 'left':
                if (cursorIndex % cols !== 0) newIndex = cursorIndex - 1;
                break;
            case 'right':
                if ((cursorIndex + 1) % cols !== 0 && cursorIndex + 1 < totalChars) {
                    newIndex = cursorIndex + 1;
                }
                break;
        }

        // Update the appropriate cursor
        if (this.isVsAI && this.selectingForAI && player === 'p1') {
            this.p2CursorIndex = newIndex;
        } else if (player === 'p1') {
            this.p1CursorIndex = newIndex;
        } else {
            this.p2CursorIndex = newIndex;
        }

        this.updateCursorDisplay();
    }

    private confirmSelection(player: 'p1' | 'p2') {
        // In VS AI mode, only P1 controls are used
        if (this.isVsAI && player === 'p2') return;

        if (this.isVsAI && this.selectingForAI) {
            // P1 is selecting for AI (P2)
            const char = this.characters[this.p2CursorIndex];
            if (char.isPlayable && char.name !== this.p1Selection) {
                this.p2Selection = char.name;
                this.updateSlotHighlight(char.name, 'p2');
                this.updatePreview(2, char.name);
                this.updateFightButton();
            }
        } else if (player === 'p1' || (this.isVsAI && !this.selectingForAI)) {
            // P1 selecting for themselves
            if (!this.p1Selection) {
                const char = this.characters[this.p1CursorIndex];
                if (char.isPlayable) {
                    this.p1Selection = char.name;
                    this.updateSlotHighlight(char.name, 'p1');
                    this.updatePreview(1, char.name);

                    if (this.isVsAI) {
                        // Switch to selecting for AI
                        this.selectingForAI = true;
                        // Move P2 cursor to first playable character that isn't P1
                        const availableIndex = this.characters.findIndex(
                            c => c.isPlayable && c.name !== this.p1Selection
                        );
                        if (availableIndex >= 0) {
                            this.p2CursorIndex = availableIndex;
                        }
                    }
                    this.updateFightButton();
                    this.updateCursorDisplay();
                }
            }
        } else if (player === 'p2' && !this.isVsAI) {
            // P2 selecting for themselves in VS Player mode
            if (!this.p2Selection) {
                const char = this.characters[this.p2CursorIndex];
                if (char.isPlayable && char.name !== this.p1Selection) {
                    this.p2Selection = char.name;
                    this.updateSlotHighlight(char.name, 'p2');
                    this.updatePreview(2, char.name);
                    this.updateFightButton();
                }
            }
        }
    }

    private handleDeselection(player: 'p1' | 'p2') {
        if (this.isVsAI) {
            // In VS AI mode, deselect works in reverse order
            if (this.selectingForAI && this.p2Selection) {
                this.clearSelection(2);
            } else if (this.p1Selection) {
                this.clearSelection(1);
                this.selectingForAI = false;
            }
        } else {
            // Normal mode - each player deselects their own
            if (player === 'p1' && this.p1Selection) {
                this.clearSelection(1);
            } else if (player === 'p2' && this.p2Selection) {
                this.clearSelection(2);
            }
        }
        this.updateFightButton();
        this.updateCursorDisplay();
    }

    private updateCursorDisplay() {
        // Reset all slot borders
        this.characters.forEach((char) => {
            const slot = this.characterSlots.get(char.name);
            if (slot) {
                const bg = slot.getData('bg') as Phaser.GameObjects.Rectangle;

                // Check if this slot is selected
                if (this.p1Selection === char.name) {
                    bg.setStrokeStyle(4, 0x4444ff);
                } else if (this.p2Selection === char.name) {
                    bg.setStrokeStyle(4, 0xff4444);
                } else if (char.isPlayable) {
                    bg.setStrokeStyle(2, 0xffcc00);
                } else {
                    bg.setStrokeStyle(2, 0x444444);
                }
            }
        });

        // Show P1 cursor (unless already selected)
        if (!this.p1Selection || (this.isVsAI && !this.selectingForAI)) {
            const p1Char = this.characters[this.p1CursorIndex];
            const p1Slot = this.characterSlots.get(p1Char?.name);
            if (p1Slot && !this.p1Selection) {
                const bg = p1Slot.getData('bg') as Phaser.GameObjects.Rectangle;
                bg.setStrokeStyle(4, 0x6666ff); // Bright blue cursor
            }
        }

        // Show P2 cursor
        const showP2Cursor = (!this.isVsAI && !this.p2Selection) ||
            (this.isVsAI && this.selectingForAI && !this.p2Selection);
        if (showP2Cursor) {
            const p2Char = this.characters[this.p2CursorIndex];
            const p2Slot = this.characterSlots.get(p2Char?.name);
            if (p2Slot) {
                const bg = p2Slot.getData('bg') as Phaser.GameObjects.Rectangle;
                bg.setStrokeStyle(4, 0xff6666); // Bright red cursor
            }
        }
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
        const animSize = 150; // Size for the animation sprite area

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

        // P1 Character Name ABOVE the animation area (to the right of portrait)
        const p1CharText = this.add.text(boxSize / 2 + animSize / 2 + 20, -animSize / 2 - 20, '???', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ffcc00',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0.5);

        // Animation container area (to the right of portrait)
        const p1AnimBg = this.add.rectangle(boxSize / 2 + animSize / 2 + 20, 20, animSize, animSize, 0x1a1a2e);
        p1AnimBg.setStrokeStyle(2, 0x4444ff);

        this.p1Preview.add([p1Label, p1Bg, p1AnimBg, p1CharText]);
        this.p1Preview.setData('charText', p1CharText);
        this.p1Preview.setData('animBg', p1AnimBg);
        this.p1Preview.setData('boxSize', { w: boxSize, h: boxHeight });
        this.p1Preview.setData('animOffset', { x: boxSize / 2 + animSize / 2 + 20, y: 20 });

        // P1 Controls Text
        const p1Controls = this.add.text(0, boxHeight / 2 + 30, 'WASD - Move\nSPACE - Select\nBACKSPACE - Undo', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '10px',
            color: '#aaaaaa',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5, 0);
        this.p1Preview.add(p1Controls);

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

        // P2 Character Name ABOVE the animation area (to the left of portrait)
        const p2CharText = this.add.text(-boxSize / 2 - animSize / 2 - 20, -animSize / 2 - 20, '???', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '14px',
            color: '#ffcc00',
            padding: { top: 4, bottom: 4 }
        }).setOrigin(0.5);

        // Animation container area (to the left of portrait)
        const p2AnimBg = this.add.rectangle(-boxSize / 2 - animSize / 2 - 20, 20, animSize, animSize, 0x1a1a2e);
        p2AnimBg.setStrokeStyle(2, 0xff4444);

        this.p2Preview.add([p2Label, p2Bg, p2AnimBg, p2CharText]);
        this.p2Preview.setData('charText', p2CharText);
        this.p2Preview.setData('animBg', p2AnimBg);
        this.p2Preview.setData('boxSize', { w: boxSize, h: boxHeight });
        this.p2Preview.setData('animOffset', { x: -boxSize / 2 - animSize / 2 - 20, y: 20 });

        // P2 Controls Text
        const p2Controls = this.add.text(0, boxHeight / 2 + 30, 'ARROWS - Move\nENTER - Select\nDELETE - Undo', {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '10px',
            color: '#aaaaaa',
            align: 'center',
            lineSpacing: 8
        }).setOrigin(0.5, 0);
        this.p2Preview.add(p2Controls);
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
            // Make interactive for playable characters (mouse click still works)
            bg.setInteractive({ useHandCursor: true });

            bg.on('pointerover', () => {
                if (!this.isSelected(char.name)) {
                    bg.setStrokeStyle(3, 0xffffff);
                }
            });

            bg.on('pointerout', () => {
                this.updateCursorDisplay();
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

            if (this.isVsAI) {
                this.selectingForAI = true;
                const availableIndex = this.characters.findIndex(
                    c => c.isPlayable && c.name !== this.p1Selection
                );
                if (availableIndex >= 0) {
                    this.p2CursorIndex = availableIndex;
                }
            }
        } else if (!this.p2Selection) {
            this.p2Selection = name;
            this.updateSlotHighlight(name, 'p2');
            this.updatePreview(2, name);
        }

        this.updateFightButton();
        this.updateCursorDisplay();
    }

    private clearSelection(player: 1 | 2) {
        if (player === 1 && this.p1Selection) {
            this.resetSlotHighlight(this.p1Selection);
            this.p1Selection = null;
            const charText = this.p1Preview.getData('charText') as Phaser.GameObjects.Text;
            charText.setText('???');
            // Remove animation sprite
            const existingAnim = this.p1Preview.getData('animSprite') as Phaser.GameObjects.Sprite;
            if (existingAnim) {
                existingAnim.destroy();
                this.p1Preview.setData('animSprite', null);
            }
            // Remove portrait
            const existingPortrait = this.p1Preview.getData('portrait') as Phaser.GameObjects.Image;
            if (existingPortrait) {
                existingPortrait.destroy();
                this.p1Preview.setData('portrait', null);
            }
        } else if (player === 2 && this.p2Selection) {
            this.resetSlotHighlight(this.p2Selection);
            this.p2Selection = null;
            const charText = this.p2Preview.getData('charText') as Phaser.GameObjects.Text;
            charText.setText('???');
            // Remove animation sprite
            const existingAnim = this.p2Preview.getData('animSprite') as Phaser.GameObjects.Sprite;
            if (existingAnim) {
                existingAnim.destroy();
                this.p2Preview.setData('animSprite', null);
            }
            // Remove portrait
            const existingPortrait = this.p2Preview.getData('portrait') as Phaser.GameObjects.Image;
            if (existingPortrait) {
                existingPortrait.destroy();
                this.p2Preview.setData('portrait', null);
            }
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

        // Update portrait in preview box
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

        // Update idle animation sprite
        const existingAnim = preview.getData('animSprite') as Phaser.GameObjects.Sprite;
        if (existingAnim) {
            existingAnim.destroy();
        }

        // Create new animation sprite if this character has one
        const animKey = `${name}_select_idle`;
        if (this.anims.exists(animKey)) {
            const animOffset = preview.getData('animOffset') as { x: number; y: number };
            const animSprite = this.add.sprite(animOffset.x, animOffset.y, `${name}_select_idle_0`);

            // Scale to fit in the animation area (150x150)
            // Apply character-specific scaling (Noel is 1.23x larger to match battle scene)
            const targetSize = 130;
            const spriteSize = Math.max(animSprite.width, animSprite.height);
            const baseScale = targetSize / spriteSize;
            const characterMultiplier = name === 'Noel' ? 1.23 : 1.0;
            const animScale = baseScale * characterMultiplier;
            animSprite.setScale(animScale);


            // Flip P2's animation to face right (toward center)
            if (player === 2) {
                animSprite.setFlipX(true);
            }

            animSprite.play(animKey);
            preview.add(animSprite);
            preview.setData('animSprite', animSprite);
        }
    }

    private createButtons(width: number, height: number) {
        const buttonY = height - 60;

        // Back button
        this.createRetroButton(width * 0.25, buttonY, 'BACK', 0xaa4444, () => {
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
