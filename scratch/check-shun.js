const { NodeSSH } = require('node-ssh');
require('dotenv').config();

async function run() {
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls = [];
    try {
        firewalls = JSON.parse(configStr);
    } catch (e) {
        console.error("Invalid FIREWALL_CONFIG JSON configuration");
        process.exit(1);
    }

    if (firewalls.length === 0) {
        console.log("No firewalls configured in FIREWALL_CONFIG.");
        return;
    }

    console.log(`Found ${firewalls.length} firewalls in configuration.`);
    const globalIps = new Set();
    const stats = {};

    for (const fw of firewalls) {
        if (!fw.ip || !fw.user || !fw.pass) {
            console.warn(`Missing credentials for firewall ${fw.name || fw.id}`);
            continue;
        }

        const ssh = new NodeSSH();
        try {
            console.log(`Connecting to ${fw.name || fw.id} (${fw.ip})...`);
            await ssh.connect({
                host: fw.ip,
                username: fw.user,
                password: fw.pass,
                readyTimeout: 10000
            });

            console.log(`Connected. Executing 'show shun'...`);
            const result = await ssh.execCommand('show shun');
            
            const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
            const lines = result.stdout.split('\n');
            const fwIps = new Set();

            for (const line of lines) {
                if (line.includes('shun ') || line.includes('Shun ')) {
                    const match = line.match(ipRegex);
                    if (match && match.length > 0) {
                        fwIps.add(match[0]);
                        globalIps.add(match[0]);
                    }
                }
            }
            
            stats[fw.name || fw.id] = fwIps.size;
            console.log(`--> Found ${fwIps.size} shunned IPs on ${fw.name || fw.id}.`);
            ssh.dispose();
        } catch (err) {
            console.error(`Failed to process ${fw.name || fw.id}:`, err.message);
            ssh.dispose();
        }
    }

    console.log("\n--- SUMMARY ---");
    for (const [fw, count] of Object.entries(stats)) {
        console.log(`${fw}: ${count} IPs`);
    }
    console.log(`TOTAL UNIQUE IPs across all firewalls: ${globalIps.size}`);
}

run();
