const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
    // Only run on Linux (production server)
    if (process.platform !== 'linux') {
        return;
    }

    console.log('[Deploy Post-Build] Checking production PM2 services and git hooks...');

    // 1. Ensure PM2 restarts citrix-guardian
    try {
        // Check if citrix-guardian is registered in PM2
        const pm2List = execSync('pm2 jlist', { encoding: 'utf8' });
        const list = JSON.parse(pm2List);
        const hasGuardian = list.some(p => p.name === 'citrix-guardian');

        if (hasGuardian) {
            console.log('[Deploy Post-Build] Restarting citrix-guardian via PM2...');
            execSync('pm2 restart citrix-guardian', { stdio: 'inherit' });
        } else {
            console.log('[Deploy Post-Build] Starting citrix-guardian in PM2...');
            execSync('pm2 start dist-scripts/cron/citrix-guardian.js --name citrix-guardian', { stdio: 'inherit' });
            execSync('pm2 save', { stdio: 'inherit' });
        }
    } catch (e) {
        console.warn('[Deploy Post-Build] Warning: Could not automatically reload PM2:', e.message);
    }

    // 2. Automatically update post-receive hook so future git deploys always restart citrix-guardian
    const potentialHookPaths = [
        path.resolve('/home/rivera/git-server/linux-dash.git/hooks/post-receive'),
        path.resolve('/home/rivera/git-server/pane-o-glass.git/hooks/post-receive'),
        path.resolve(process.env.HOME || '/home/rivera', 'git-server/linux-dash.git/hooks/post-receive')
    ];

    for (const hookPath of potentialHookPaths) {
        try {
            if (fs.existsSync(hookPath)) {
                let hookContent = fs.readFileSync(hookPath, 'utf8');
                let modified = false;

                // Look for pm2 restart lines that don't have citrix-guardian
                if (hookContent.includes('pm2 restart') && !hookContent.includes('citrix-guardian')) {
                    hookContent = hookContent.replace(/pm2 restart ([^\n]+)/g, (match, procs) => {
                        return `pm2 restart ${procs.trim()} citrix-guardian`;
                    });
                    modified = true;
                } else if (!hookContent.includes('citrix-guardian')) {
                    // Append pm2 restart citrix-guardian before exit
                    hookContent += '\npm2 restart citrix-guardian || pm2 start dist-scripts/cron/citrix-guardian.js --name citrix-guardian\n';
                    modified = true;
                }

                if (modified) {
                    fs.writeFileSync(hookPath, hookContent, 'utf8');
                    fs.chmodSync(hookPath, '755');
                    console.log(`[Deploy Post-Build] Updated ${hookPath} to automatically restart citrix-guardian on every deploy!`);
                } else {
                    console.log(`[Deploy Post-Build] Hook ${hookPath} already contains citrix-guardian.`);
                }
            }
        } catch (err) {
            console.warn(`[Deploy Post-Build] Note: Could not update ${hookPath}:`, err.message);
        }
    }
}

main();
