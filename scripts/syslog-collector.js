const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
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
    } catch (err) {
        console.log(`[RECOVERY] Buffer corrupted. Initializing fresh dataset.`);
        activeBuffer = [];
        // Clear corrupted file
        try { fs.unlinkSync(BUFFER_PATH); } catch(e) {}
    }
}

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS ATOMIC COLLECTOR (v2.8.1) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Active Buffer: ${BUFFER_PATH} (Max 1000)`);
    console.log(`--------------------------------------------------------\n`);
});

server.on('message', (msg, rinfo) => {
    const raw = msg.toString();
    
    // We filter for Cisco ISE TACACS Specific Tags
    if (raw.includes('TACACS')) {
        process.stdout.write('T');
        
        const entry = {
            timestamp: new Date().toISOString(),
            source: rinfo.address,
            raw: raw
        };

        // Rotate the buffer (1000 record cap)
        if (activeBuffer.length >= 1000) activeBuffer.shift();
        activeBuffer.push(entry);

        // ATOMIC WRITE STRATEGY (v2.8.1)
        // Write to tmp, then rename. This prevents half-written files / corruption.
        try {
            const dataString = JSON.stringify(activeBuffer, null, 2);
            fs.writeFileSync(TEMP_BUFFER_PATH, dataString);
            fs.renameSync(TEMP_BUFFER_PATH, BUFFER_PATH);
        } catch (err) {
            console.error(`\n[WRITE ERROR] ${err.message}`);
        }
    } else {
        process.stdout.write('.');
    }
});

server.bind(PORT, HOST);

// Daily Background Rotation (7 Days)
function rotateLogs() {
    console.log(`\n[ROTATION STARTED] Scanning for logs older than 7 days...`);
    // Existing logic... but for the 1000-record JSON limit, we are already circular.
    // This is for the flat archives if we add them back.
}

setImmediate(rotateLogs);
setInterval(rotateLogs, 86400000);
