import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('Assets/Character');
const outputDir = path.resolve('public');
const outputFile = path.join(outputDir, 'character-manifest.json');

// Ensure public dir exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const characters = [];

if (fs.existsSync(assetsDir)) {
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const charName = entry.name;
            const charPath = path.join(assetsDir, charName);
            const walkPath = path.join(charPath, 'Walk');
            let walkFrames = [];

            if (fs.existsSync(walkPath)) {
                walkFrames = fs.readdirSync(walkPath)
                    .filter(file => file.endsWith('.png'))
                    .map(file => `Assets/Character/${charName}/Walk/${file}`);
            }

            characters.push({
                name: charName,
                path: `Assets/Character/${charName}`,
                walkFrames: walkFrames,
                idleFrame: `Assets/Character/${charName}/Walk/sprite_0014.png` // Updated as requested
            });
        }
    }
}

const manifest = {
    characters
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`Manifest generated at ${outputFile} with ${characters.length} characters.`);
