import { runPeriodicHealthSweep } from '../../src/lib/vpn-ping-service';
import { prisma } from '../../src/lib/prisma';

async function main() {
    const isDaemon = process.argv.includes('--daemon');
    console.log(`[VPN-HEALTH-CRON] Starting VPN ICMP Health Probe Worker (Mode: ${isDaemon ? 'Continuous Daemon' : 'Single Sweep'})...`);

    const runSweep = async () => {
        const startTime = Date.now();
        try {
            const samples = await runPeriodicHealthSweep();
            const durationMs = Date.now() - startTime;
            const onlineCount = samples.filter(s => s.alive).length;
            console.log(`[VPN-HEALTH-CRON][${new Date().toISOString()}] Probed ${samples.length} endpoints in ${durationMs}ms:`);
            for (const s of samples) {
                const statusIcon = s.alive ? (s.rttAvg > 100 ? '🟡' : '🟢') : '🔴';
                console.log(`  ${statusIcon} ${s.label} (${s.target}): ${s.alive ? `${s.rttAvg}ms` : 'TIMEOUT'} (Loss: ${s.packetLoss}%)`);
            }

            // Record status in BackgroundJob table for System Health dashboard monitoring
            try {
                await prisma.backgroundJob.upsert({
                    where: { name: "VPN Health Probes" },
                    create: {
                        name: "VPN Health Probes",
                        lastRun: new Date(),
                        status: "SUCCESS",
                        message: `Probed ${samples.length} endpoints in ${durationMs}ms (${onlineCount}/${samples.length} online)`
                    },
                    update: {
                        lastRun: new Date(),
                        status: "SUCCESS",
                        message: `Probed ${samples.length} endpoints in ${durationMs}ms (${onlineCount}/${samples.length} online)`
                    }
                });
            } catch (dbErr) {
                console.warn("[VPN-HEALTH-CRON] Warning: Failed to record BackgroundJob in DB:", dbErr);
            }
        } catch (err: any) {
            console.error('[VPN-HEALTH-CRON] Probe sweep failed:', err.message);
            try {
                await prisma.backgroundJob.upsert({
                    where: { name: "VPN Health Probes" },
                    create: {
                        name: "VPN Health Probes",
                        lastRun: new Date(),
                        status: "FAILURE",
                        message: err.message || "Probe sweep failed"
                    },
                    update: {
                        lastRun: new Date(),
                        status: "FAILURE",
                        message: err.message || "Probe sweep failed"
                    }
                });
            } catch {}
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
