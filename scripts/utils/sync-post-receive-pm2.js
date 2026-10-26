const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
    // Only run on Linux (production server)
    if (process.platform !== 'linux') {
        return;
    }

    console.log('[Deploy Post-Build] Checking production PM2 services and git hooks...');

    // 1. Ensure PM2 restarts citrix-guardian immediately
    try {
        console.log('[Deploy Post-Build] Ensuring citrix-guardian is active in PM2...');
        try {
            execSync('pm2 restart citrix-guardian', { stdio: 'inherit' });
            console.log('[Deploy Post-Build] Successfully restarted citrix-guardian in PM2.');
        } catch {
            console.log('[Deploy Post-Build] Starting citrix-guardian for the first time in PM2...');
            execSync('pm2 start dist-scripts/cron/citrix-guardian.js --name citrix-guardian', { stdio: 'inherit' });
            execSync('pm2 save', { stdio: 'inherit' });
            console.log('[Deploy Post-Build] Started and saved citrix-guardian in PM2.');
        }
    } catch (e) {
        console.warn('[Deploy Post-Build] Warning reloading PM2:', e.message);
    }

    // 2. Automatically update post-receive hook so Step [4/4] always reloads citrix-guardian on every future deploy
    const potentialHookPaths = [
        '/home/rivera/git-server/linux-dash.git/hooks/post-receive',
        '/home/rivera/git-server/pane-o-glass.git/hooks/post-receive',
        path.resolve(process.env.HOME || '/home/rivera', 'git-server/linux-dash.git/hooks/post-receive'),
        path.resolve(process.env.HOME || '/home/rivera', 'git-server/pane-o-glass.git/hooks/post-receive')
    ];

    for (const hookPath of potentialHookPaths) {
        try {
            if (fs.existsSync(hookPath)) {
                let hookContent = fs.readFileSync(hookPath, 'utf8');
                let modified = false;

                // Match both "pm2 reload ..." and "pm2 restart ..."
                const pm2Regex = /pm2\s+(reload|restart)\s+([^\n]+)/g;

                if (pm2Regex.test(hookContent) && !hookContent.includes('citrix-guardian')) {
                    hookContent = hookContent.replace(pm2Regex, (match, action, procs) => {
                        const trimmed = procs.trim();
                        if (!trimmed.includes('citrix-guardian')) {
                            return `pm2 ${action} ${trimmed} citrix-guardian`;
                        }
                        return match;
                    });
                    modified = true;
                } else if (!hookContent.includes('citrix-guardian')) {
                    // Append before exit if no match found
                    hookContent += '\npm2 restart citrix-guardian || pm2 start dist-scripts/cron/citrix-guardian.js --name citrix-guardian\n';
                    modified = true;
                }

                if (modified) {
                    fs.writeFileSync(hookPath, hookContent, 'utf8');
                    fs.chmodSync(hookPath, '755');
                    console.log(`[Deploy Post-Build] Updated ${hookPath} to automatically reload citrix-guardian on every deploy!`);
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
