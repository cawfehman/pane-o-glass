const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');

if (!fs.existsSync(BUFFER_PATH)) {
    console.error(`[ERROR] Buffer not found at ${BUFFER_PATH}. Nothing to prime.`);
    process.exit(1);
}

console.log(`\n--- ISE 3.3 TACACS FORENSIC PRIMING ENGINE (v3.2.0) ---`);
console.log(`Source: ${BUFFER_PATH}`);

try {
    const data = fs.readFileSync(BUFFER_PATH, 'utf8');
    const entries = JSON.parse(data);
    console.log(`Loaded ${entries.length} entries from real-time buffer.`);

    let migrated = 0;
    entries.forEach(entry => {
        if (!entry.timestamp) return;
        const dateStr = entry.timestamp.split('T')[0];
        const dailyPath = path.join(LOG_DIR, `tacacs-${dateStr}.json`);
        
        // Append entry to daily JSONL
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(dailyPath, line);
        migrated++;
    });

    console.log(`Successfully primed ${migrated} entries into historical archives.`);
    console.log(`--------------------------------------------------------\n`);

} catch (err) {
    console.error(`[FATAL] Migration failed: ${err.message}`);
}
