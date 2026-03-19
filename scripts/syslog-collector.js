const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const server = dgram.createSocket('udp4');

const PORT = 514;
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

// Initial buffer state
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
    
    console.log(`\n[ARCHIVE] Compressing ${fileName} -> ${archivePath}`);
    
    return new Promise((resolve, reject) => {
        const gzip = zlib.createGzip();
        const source = fs.createReadStream(filePath);
        const destination = fs.createWriteStream(archivePath);
        
        source.pipe(gzip).pipe(destination);
        
        destination.on('finish', () => {
            fs.unlinkSync(filePath); // Delete raw file after compression
            resolve();
        });
        
        destination.on('error', reject);
    });
}

async function rotateLogs() {
    console.log(`\n[ROTATION] Checking for logs older than ${RETENTION_DAYS} days...`);
    const files = fs.readdirSync(ACTIVE_DIR);
    const now = new Date();
    
    for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        // Extract date from tacacs-YYYY-MM-DD.log
        const match = file.match(/tacacs-(\d{4}-\d{2}-\d{2})\.log/);
        if (match) {
            const fileDate = new Date(match[1]);
            const diffDays = (now - fileDate) / (1000 * 60 * 60 * 24);
            
            if (diffDays > RETENTION_DAYS) {
                try {
                    await archiveFile(path.join(ACTIVE_DIR, file));
                } catch (e) {
                    console.error(`Failed to archive ${file}:`, e.message);
                }
            }
        }
    }
}

function saveLog(message, remote) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        raw: message.trim(),
        source: `${remote.address}`
    };

    // 1. Append to Daily Active Log
    const activePath = getDailyLogPath();
    const line = `${timestamp} [${remote.address}] ${message.trim()}\n`;
    fs.appendFile(activePath, line, (err) => {
        if (err) console.error("Error writing to active log:", err);
    });

    // 2. Update Fast Buffer (Circular)
    recentLogs.unshift(logEntry);
    if (recentLogs.length > MAX_BUFFER_SIZE) recentLogs.pop();
    fs.writeFile(BUFFER_PATH, JSON.stringify(recentLogs, null, 2), (err) => {
        if (err) console.error("Error writing to buffer:", err);
    });
}

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS DATE-PARTITIONED COLLECTOR (v2.5.0) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Active Logs: ${ACTIVE_DIR}`);
    console.log(`Archive (GZIP): ${ARCHIVE_DIR} (After ${RETENTION_DAYS} days)`);
    console.log(`--------------------------------------------------------`);
    
    // Run rotation initial check
    rotateLogs();
    // Schedule rotation every 12 hours
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
    if (err.code === 'EACCES') {
        console.error(`\nERROR: Permission denied. Port 514 usually requires root privileges.`);
    }
    server.close();
});

server.bind(PORT, HOST);
