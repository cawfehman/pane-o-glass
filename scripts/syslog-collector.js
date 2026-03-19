const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const server = dgram.createSocket('udp4');

const PORT = 514;
const HOST = '0.0.0.0';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const ARCHIVE_PATH = path.join(LOG_DIR, 'tacacs-archive.log');
const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');
const MAX_BUFFER_SIZE = 1000;

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Initial buffer state
let recentLogs = [];
if (fs.existsSync(BUFFER_PATH)) {
    try {
        recentLogs = JSON.parse(fs.readFileSync(BUFFER_PATH, 'utf8'));
    } catch (e) {
        console.error("Warning: Could not read existing buffer file.");
    }
}

function saveLog(message, remote) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        raw: message.trim(),
        source: `${remote.address}`,
        // Future: Parse specific fields here
    };

    // 1. Append to Archive
    const archiveLine = `${timestamp} [${remote.address}] ${message.trim()}\n`;
    fs.appendFile(ARCHIVE_PATH, archiveLine, (err) => {
        if (err) console.error("Error writing to archive:", err);
    });

    // 2. Update Fast Buffer (Circular)
    recentLogs.unshift(logEntry);
    if (recentLogs.length > MAX_BUFFER_SIZE) {
        recentLogs.pop();
    }

    // 3. Persist Buffer for Next.js Ingestion
    fs.writeFile(BUFFER_PATH, JSON.stringify(recentLogs, null, 2), (err) => {
        if (err) console.error("Error writing to buffer:", err);
    });
}

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS SYSLOG COLLECTOR (v2.4.0) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Archive: ${ARCHIVE_PATH}`);
    console.log(`Purity Buffer: ${BUFFER_PATH} (${MAX_BUFFER_SIZE} records)`);
    console.log(`--------------------------------------------------------`);
});

server.on('message', (msg, remote) => {
    const message = msg.toString();
    
    // Cisco ISE TACACS messages
    if (message.includes('TACACS') || message.includes('Device Admin')) {
        process.stdout.write('T'); // T for TACACS
        saveLog(message, remote);
    } else {
        process.stdout.write('.');
    }
});

server.on('error', (err) => {
    console.error(`Collector Error:\n${err.stack}`);
    if (err.code === 'EACCES') {
        console.error(`\nERROR: Permission denied. Port 514 usually requires root/admin privileges.`);
        console.error(`Try running with sudo node scripts/syslog-collector.js`);
    }
    server.close();
});

server.bind(PORT, HOST);
