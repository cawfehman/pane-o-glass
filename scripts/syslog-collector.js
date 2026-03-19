const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const PORT = 514;
const HOST = '0.0.0.0';

server.on('listening', () => {
    const address = server.address();
    console.log(`\n--- ISE 3.3 TACACS SYSLOG COLLECTOR (v2.3.0) ---`);
    console.log(`Listening on: ${address.address}:${address.port}`);
    console.log(`Please configure ISE to send TACACS logs to this server IP.`);
    console.log(`--------------------------------------------------------`);
});

server.on('message', (msg, remote) => {
    const message = msg.toString();
    
    // Cisco ISE TACACS messages often contain CI_TACACS or sensitive event IDs
    if (message.includes('TACACS') || message.includes('Device Admin')) {
        console.log(`\n[NEW TACACS LOG] From ${remote.address}:${remote.port}`);
        console.log(`Message: ${message.trim()}`);
    } else {
        // Log a snippet of other traffic to confirm connectivity
        process.stdout.write('.');
    }
});

server.on('error', (err) => {
    console.error(`Collector Error:\n${err.stack}`);
    if (err.code === 'EACCES') {
        console.error(`\nERROR: Permission denied. Port 514 usually requires root/admin privileges.`);
        console.error(`Try running with sudo or as Administrator.`);
    }
    server.close();
});

server.bind(PORT, HOST);
