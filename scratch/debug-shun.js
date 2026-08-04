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

        const shell = await ssh.requestShell();
        let output = '';
        
        shell.on('data', (data) => {
            output += data.toString('utf8');
        });

        // Just wait for prompt
        await new Promise(r => setTimeout(r, 5000));

        output = ''; // clear initial login banner
        shell.write('show shun\r\n');
        
        console.log("Waiting 30 seconds for output...");
        await new Promise(r => setTimeout(r, 30000));

        fs.writeFileSync('scratch/debug-shun.txt', output);
        console.log("Shell output length:", output.length);
        
        shell.write('exit\r\n');
        setTimeout(() => {
            ssh.dispose();
            process.exit(0);
        }, 1000);
        console.log("Shell output length:", output.length);
        ssh.dispose();
    } catch (err) {
        console.error(err);
        ssh.dispose();
    }
}
run();
