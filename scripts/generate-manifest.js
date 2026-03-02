// generate-manifest.js
import fs from 'fs';
import path from 'path';

// Define the absolute paths (or run it relative to project root)
const projectRoot = process.cwd(); // Assume this script is run from project root: node scripts/generate-manifest.js
const charsDir = path.join(projectRoot, 'Assets', 'Character');
const publicManifestPath = path.join(projectRoot, 'public', 'character-manifest.json');

console.log('Generating character manifest automatically...');

if (!fs.existsSync(charsDir)) {
    console.error(`Cannot find Assets directory at ${charsDir}`);
    process.exit(1);
}

const characters = [];

// Helper to get files sorted in a directory matching a pattern (like sprite_*.png)
function getSortedSprits(dirPath, ext = '.png') {
    if (!fs.existsSync(dirPath)) return [];

    return fs.readdirSync(dirPath)
        .filter(file => file.endsWith(ext) && file.startsWith('sprite_'))
        .sort()
        .map(file => path.relative(projectRoot, path.join(dirPath, file)).replace(/\\/g, '/'));
}

// Ensure the manifest structure retains character-specific config like `jabFrameRate` if it exists in the old manifest
let existingManifest = { characters: [] };
if (fs.existsSync(publicManifestPath)) {
    try {
        existingManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
    } catch (e) {
        console.warn('Could not parse existing manifest, creating fresh.');
    }
}

const charNames = fs.readdirSync(charsDir).filter(name => {
    return fs.statSync(path.join(charsDir, name)).isDirectory();
});

charNames.forEach(charName => {
    const charRoot = path.join(charsDir, charName);

    // Look up existing char config to preserve properties like jabFrameRate
    const existingCharConfig = existingManifest.characters.find(c => c.name === charName) || {};

    const charData = {
        name: charName,
        path: `Assets/Character/${charName}`,
        ...existingCharConfig // Keep existing properties
    };

    // Auto-update frames based on directory contents
    charData.walkFrames = getSortedSprits(path.join(charRoot, 'Walk'));
    charData.idleFrames = getSortedSprits(path.join(charRoot, 'Idle'));
    charData.jabFrames = getSortedSprits(path.join(charRoot, 'Jab'));
    charData.duckFrames = getSortedSprits(path.join(charRoot, 'Duck'));
    charData.jumpFrames = getSortedSprits(path.join(charRoot, 'Jump'));
    charData.blockFrames = getSortedSprits(path.join(charRoot, 'Block'));

    // Character-specific frame rate defaults - only if they don't already exist
    if (!charData.frameRates) {
        charData.frameRates = {
            walk: 24,
            idle: 20,
            jab: 60,
            duck: 48,
            jump: 48,
            block: 48
        };
    } else {
        // Ensure all keys exist in frameRates even if some were manually added
        const defaults = { walk: 24, idle: 20, jab: 60, duck: 48, jump: 48, block: 48 };
        charData.frameRates = { ...defaults, ...charData.frameRates };
    }

    // Some characters might have a single idleFrame instead of multiple frames
    if (charData.idleFrames.length === 0 && fs.existsSync(path.join(charRoot, 'Walk', 'sprite_0014.png'))) {
        charData.idleFrame = `Assets/Character/${charName}/Walk/sprite_0014.png`;
    }

    characters.push(charData);
});

const newManifest = {
    characters
};

fs.writeFileSync(publicManifestPath, JSON.stringify(newManifest, null, 2), 'utf8');

// Also try writing to dist if it exists (for build step)
const distManifestPath = path.join(projectRoot, 'dist', 'character-manifest.json');
if (fs.existsSync(path.dirname(distManifestPath))) {
    fs.writeFileSync(distManifestPath, JSON.stringify(newManifest, null, 2), 'utf8');
}

console.log('Successfully generated public/character-manifest.json');
