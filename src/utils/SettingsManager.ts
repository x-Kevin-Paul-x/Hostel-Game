// Centralized Settings Manager with localStorage persistence

export interface GameSettings {
    // Title screen music
    titleMusicVolume: number;
    titleMusicEnabled: boolean;
    // Fight screen music
    fightMusicVolume: number;
    fightMusicEnabled: boolean;
    // SFX
    sfxVolume: number;
    sfxEnabled: boolean;
    // Display
    showFPS: boolean;
    screenShake: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
    titleMusicVolume: 0.5,
    titleMusicEnabled: true,
    fightMusicVolume: 0.5,
    fightMusicEnabled: true,
    sfxVolume: 0.7,
    sfxEnabled: true,
    showFPS: false,
    screenShake: true,
};

const STORAGE_KEY = 'hostelFighter_settings';

export class SettingsManager {
    private static instance: SettingsManager;
    private settings: GameSettings;

    private constructor() {
        this.settings = this.loadSettings();
    }

    public static getInstance(): SettingsManager {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }

    private loadSettings(): GameSettings {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with defaults to handle new settings added in updates
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load settings from localStorage:', e);
        }
        return { ...DEFAULT_SETTINGS };
    }

    public saveSettings(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Failed to save settings to localStorage:', e);
        }
    }

    public get<K extends keyof GameSettings>(key: K): GameSettings[K] {
        return this.settings[key];
    }

    public set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
        this.settings[key] = value;
        this.saveSettings();
    }

    public getAll(): GameSettings {
        return { ...this.settings };
    }

    public reset(): void {
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
    }
}
