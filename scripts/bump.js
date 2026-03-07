const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../src/version.json');
const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));

const currentVersion = versionData.version;
// Expects format like "0.5.01"
const parts = currentVersion.split('.');

if (parts.length === 3) {
    const major = parts[0];
    const minor = parts[1];
    let build = parseInt(parts[2], 10);

    build += 1;
    // Pad with leading zero if less than 10
    const newBuild = build < 10 ? `0${build}` : `${build}`;

    const newVersion = `${major}.${minor}.${newBuild}`;

    versionData.version = newVersion;
    fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 4));

    console.log(`Bumped version from ${currentVersion} to ${newVersion}`);
} else {
    console.error(`Invalid version format: ${currentVersion}. Expected X.Y.ZZ`);
    process.exit(1);
}
