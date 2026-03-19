const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const server = dgram.createSocket('udp4');

const PORT = 1514;
const HOST = '0.0.0.0';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const ACTIVE_DIR = path.join(LOG_DIR, 'active');
const ARCHIVE_DIR = path.join(LOG_DIR, 'archive');
const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');
const MAX_BUFFER_SIZE = 1000;
const RETENTION_DAYS = 7;

// Ensure directories exist
[LOG_DIR, ACTIVE_DIR, ARCHIVE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let recentLogs = [];
if (fs.existsSync(BUFFER_PATH)) {
    try {
        recentLogs = JSON.parse(fs.readFileSync(BUFFER_PATH, 'utf8'));
    } catch (e) {
        console.error("Warning: Could not read existing buffer file.");
    }
}

function getDailyLogPath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(ACTIVE_DIR, `tacacs-${date}.log`);
}

async function archiveFile(filePath) {
    const fileName = path.basename(filePath);
    const archivePath = path.join(ARCHIVE_DIR, `${fileName}.gz`);
    return new Promise((resolve, reject) => {
        const gzip = zlib.createGzip();
        const source = fs.createReadStream(filePath);
        const destination = fs.createWriteStream(archivePath);
        source.pipe(gzip).pipe(destination);
        destination.on('finish', () => {
            fs.unlinkSync(filePath);
            resolve();
        });
        destination.on('error', reject);
    });
}

async function rotateLogs() {
    try {
        console.log(`\n[ROTATION STARTED] Scanning for logs older than ${RETENTION_DAYS} days...`);
        const files = await fs.promises.readdir(ACTIVE_DIR);
        const now = new Date();
        let rotatedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.log')) continue;
            const match = file.match(/tacacs-(\d{4}-\d{2}-\d{2})\.log/);
            if (match) {
                const fileDate = new Date(match[1]);
                const diffDays = (now - fileDate) / (1000 * 60 * 60 * 24);
                if (diffDays > RETENTION_DAYS) {
                    await archiveFile(path.join(ACTIVE_DIR, file));
                    rotatedCount++;
                }
            }
        }
        console.log(`[ROTATION COMPLETED] ${rotatedCount} files archived.`);
    } catch (err) {
        console.error(`[ROTATION FAILED] ${err.message}`);
    }
}

function saveLog(message, remote) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, raw: message.trim(), source: `${remote.address}` };
    const activePath = getDailyLogPath();
    const line = `${timestamp} [${remote.address}] ${message.trim()}\n`;
    fs.appendFile(activePath, line, (err) => {
        if (err) console.error("Error writing to active log:", err);
    });
    recentLogs.unshift(logEntry);
    if (recentLogs.length > MAX_BUFFER_SIZE) recentLogs.pop();
    fs.writeFile(BUFFER_PATH, JSON.stringify(recentLogs, null, 2), (err) => {
        if (err) console.error("Error writing to buffer:", err);
    });
}

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS NON-BLOCKING COLLECTOR (v2.6.1) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Active Logs: ${ACTIVE_DIR}`);
    console.log(`Archive (GZIP): ${ARCHIVE_DIR} (After ${RETENTION_DAYS} days)`);
    console.log(`--------------------------------------------------------`);
    
    // Background rotation
    setImmediate(rotateLogs);
    setInterval(rotateLogs, 12 * 60 * 60 * 1000);
});

server.on('message', (msg, remote) => {
    const message = msg.toString();
    if (message.includes('TACACS') || message.includes('Device Admin')) {
        process.stdout.write('T');
        saveLog(message, remote);
    } else {
        process.stdout.write('.');
    }
});

server.on('error', (err) => {
    console.error(`Collector Error:\n${err.stack}`);
    if (err.code === 'EACCES') console.error(`\nERROR: Permission denied.`);
    server.close();
});

server.bind(PORT, HOST);
