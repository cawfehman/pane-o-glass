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
        
        await new Promise((resolve, reject) => {
            shell.on('data', (data) => { output += data.toString('utf8'); });
            shell.on('error', reject);
            
            const waitForPrompt = (timeoutMs = 60000) => {
                return new Promise((res) => {
                    const start = Date.now();
                    const check = () => {
                        const trimmed = output.trim();
                        if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
                            res();
                        } else if (Date.now() - start > timeoutMs) {
                            res();
                        } else {
                            setTimeout(check, 250);
                        }
                    };
                    check();
                });
            };

            const executeSequence = async () => {
                try {
                    // Wait for initial login prompt
                    await waitForPrompt(10000);
                    
                    output = '';
                    shell.write('terminal pager 0\n');
                    await waitForPrompt(5000);

                    output = '';
                    shell.write('show shun\n');
                    await waitForPrompt(120000);

                    fs.writeFileSync('scratch/debug-shun.txt', output);
                    console.log("Shell output length:", output.length);

                    shell.write('exit\n');
                    setTimeout(resolve, 1000);
                } catch (e) {
                    reject(e);
                }
            };

            executeSequence();
        });
        console.log("Shell output length:", output.length);
        ssh.dispose();
    } catch (err) {
        console.error(err);
        ssh.dispose();
    }
}
run();
