const { NodeSSH } = require('node-ssh');
const fs = require('fs');
require('dotenv').config();

async function run() {
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls = [];
    try {
        firewalls = JSON.parse(configStr);
    } catch (e) {
        process.exit(1);
    }

    if (firewalls.length === 0) return;
    const fw = firewalls[0]; 

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: fw.ip,
            username: fw.user,
            password: fw.pass,
            readyTimeout: 10000
        });

        // Try using shell stream instead of execCommand
        const shell = await ssh.requestShell();
        
        let output = '';
        shell.on('data', (data) => {
            output += data.toString('utf8');
        });

        // Send commands
        shell.write('terminal pager 0\n');
        shell.write('show shun\n');
        shell.write('exit\n');

        // wait for close
        await new Promise((resolve) => {
            shell.on('close', resolve);
        });

        fs.writeFileSync('scratch/debug-shun.txt', output);
        console.log("Shell output length:", output.length);
        ssh.dispose();
    } catch (err) {
        console.error(err);
        ssh.dispose();
    }
}
run();
