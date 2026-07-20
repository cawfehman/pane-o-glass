import * as dgram from 'dgram';
import fs from 'fs';
import path from 'path';
const server = dgram.createSocket('udp4');

const PORT = 1514;
const HOST = '0.0.0.0';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');
const TEMP_BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json.tmp');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Load existing buffer or initialize fresh
let activeBuffer = [];
if (fs.existsSync(BUFFER_PATH)) {
    try {
        const data = fs.readFileSync(BUFFER_PATH, 'utf8');
        activeBuffer = JSON.parse(data);
        console.log(`[BOOT] Loaded ${activeBuffer.length} existing logs.`);
    } catch (err: any) {
        console.log(`[RECOVERY] Buffer corrupted. Initializing fresh dataset.`);
        activeBuffer = [];
        try { fs.unlinkSync(BUFFER_PATH); } catch (e: any) {}
    }
}

let dailyBuffer: string[] = [];

// --- Daily Persistence Engine (v3.0.0) ---
function saveToDailyLog(entry: any) {
    const line = JSON.stringify(entry) + '\n';
    dailyBuffer.push(line);
}

let writeTimeout: any = null;
function scheduleBufferWrite() {
    if (writeTimeout) return;
    writeTimeout = setTimeout(() => {
        writeTimeout = null;
        
        // 1. Flush Daily Log Buffer
        if (dailyBuffer.length > 0) {
            const dateStr = new Date().toISOString().split('T')[0];
            const dailyPath = path.join(LOG_DIR, `tacacs-${dateStr}.json`);
            const chunk = dailyBuffer.join('');
            dailyBuffer = []; // Clear immediately to capture incoming
            fs.appendFile(dailyPath, chunk, (err: any) => {
                if (err) console.error(`[DAILY WRITE ERROR] ${err.message}`);
            });
        }
        
        // 2. Flush Active Buffer Async
        try {
            const dataString = JSON.stringify(activeBuffer, null, 2);
            fs.writeFile(TEMP_BUFFER_PATH, dataString, (err: any) => {
                if (!err) {
                    fs.rename(TEMP_BUFFER_PATH, BUFFER_PATH, () => {});
                }
            });
        } catch (err: any) {
            console.error(`\n[WRITE ERROR] ${err.message}`);
        }
    }, 1000);
}

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS ATOMIC COLLECTOR (v3.0.0) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Active Buffer: ${BUFFER_PATH} (Max 1000)`);
    console.log(`Daily Persistence: logs/tacacs-YYYY-MM-DD.json (Last 7 Days)`);
    console.log(`--------------------------------------------------------\n`);
});

server.on('message', (msg: any, rinfo: any) => {
    const raw = msg.toString();
    
    if (raw.includes('TACACS')) {
        process.stdout.write('T');
        
        const entry = {
            timestamp: new Date().toISOString(),
            source: rinfo.address,
            raw: raw
        };

        // 1. Permanent Daily Log (v3.0.0)
        saveToDailyLog(entry);

        // 2. Real-Time Circular Buffer (1000 record cap)
        if (activeBuffer.length >= 1000) activeBuffer.shift();
        activeBuffer.push(entry);

        // Atomic write for recent buffer (DEBOUNCED)
        scheduleBufferWrite();
    } else {
        process.stdout.write('.');
    }
});

server.on('error', (err: any) => {
    console.error(`[SERVER ERROR] ${err.stack}`);
    server.close();
});

server.bind(PORT, HOST);

// Daily Maintenance (Purge logs older than 7 days)
function purgeOldLogs() {
    console.log(`\n[MAINTENANCE] Scanning for logs older than 7 days...`);
    const files = fs.readdirSync(LOG_DIR);
    const now = new Date();
    const expiry = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    files.forEach(file => {
        if (file.startsWith('tacacs-') && file.endsWith('.json') && file !== 'tacacs-recent.json') {
            const dateMatch = file.match(/tacacs-(\d{4}-\d{2}-\d{2})\.json/);
            if (dateMatch) {
                const fileDate = new Date(dateMatch[1]);
                if (fileDate < expiry) {
                    console.log(`[PURGE] Deleting expired log: ${file}`);
                    fs.unlinkSync(path.join(LOG_DIR, file));
                }
            }
        }
    });
}

setInterval(purgeOldLogs, 86400000); // Once a day
setImmediate(purgeOldLogs); // Run on startup
