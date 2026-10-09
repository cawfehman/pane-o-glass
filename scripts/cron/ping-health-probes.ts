import { runPeriodicHealthSweep } from '../../src/lib/vpn-ping-service';

async function main() {
    const isDaemon = process.argv.includes('--daemon');
    console.log(`[VPN-HEALTH-CRON] Starting VPN ICMP Health Probe Worker (Mode: ${isDaemon ? 'Continuous Daemon' : 'Single Sweep'})...`);

    const runSweep = async () => {
        try {
            const startTime = Date.now();
            const samples = await runPeriodicHealthSweep();
            const durationMs = Date.now() - startTime;
            console.log(`[VPN-HEALTH-CRON][${new Date().toISOString()}] Probed ${samples.length} endpoints in ${durationMs}ms:`);
            for (const s of samples) {
                const statusIcon = s.alive ? (s.rttAvg > 100 ? '🟡' : '🟢') : '🔴';
                console.log(`  ${statusIcon} ${s.label} (${s.target}): ${s.alive ? `${s.rttAvg}ms` : 'TIMEOUT'} (Loss: ${s.packetLoss}%)`);
            }
        } catch (err: any) {
            console.error('[VPN-HEALTH-CRON] Probe sweep failed:', err.message);
        }
    };

    // Run first sweep immediately
    await runSweep();

    if (isDaemon) {
        console.log('[VPN-HEALTH-CRON] Daemon mode active: running every 5 minutes (300s)...');
        setInterval(async () => {
            await runSweep();
        }, 5 * 60 * 1000);
    } else {
        process.exit(0);
    }
}

main().catch(err => {
    console.error('[VPN-HEALTH-CRON] Fatal worker error:', err);
    process.exit(1);
});
