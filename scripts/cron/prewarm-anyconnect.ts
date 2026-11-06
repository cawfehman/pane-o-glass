import axios from "axios";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function prewarmOnce(): Promise<{ success: boolean; message: string }> {
    const port = process.env.PORT || 3000;
    const targetUrl = `http://127.0.0.1:${port}/api/vpn/live?action=sessions&refresh=true`;
    const t0 = Date.now();

    try {
        const res = await axios.get(targetUrl, {
            timeout: 60000,
            headers: { "X-Requested-By": "anyconnect-prewarm-worker" }
        });

        const durationMs = Date.now() - t0;
        const total = res.data?.totalSessions || res.data?.sessions?.length || 0;
        const msg = `Warmed ${total} active sessions across cluster nodes in ${durationMs}ms`;
        console.log(`[ANYCONNECT-PREWARM] ${msg}`);

        // Update BackgroundJob heartbeat
        await prisma.backgroundJob.upsert({
            where: { name: "AnyConnect Cache Pre-Warm" },
            create: {
                name: "AnyConnect Cache Pre-Warm",
                lastRun: new Date(),
                status: "SUCCESS",
                message: msg
            },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: msg
            }
        });

        return { success: true, message: msg };
    } catch (err: any) {
        const errorMsg = `Pre-warm sweep failed: ${err.message}`;
        console.error(`[ANYCONNECT-PREWARM] ${errorMsg}`);

        // Record status in BackgroundJob so health dashboard tracks activity
        await prisma.backgroundJob.upsert({
            where: { name: "AnyConnect Cache Pre-Warm" },
            create: {
                name: "AnyConnect Cache Pre-Warm",
                lastRun: new Date(),
                status: "FAILURE",
                message: errorMsg
            },
            update: {
                lastRun: new Date(),
                status: "FAILURE",
                message: errorMsg
            }
        }).catch(() => {});

        return { success: false, message: errorMsg };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isDaemon = args.includes("--daemon") || !args.includes("--once");
    const intervalSec = 120; // 2 minutes

    if (!isDaemon) {
        await prewarmOnce();
        await prisma.$disconnect();
        process.exit(0);
    }

    console.log(`[ANYCONNECT-PREWARM] Starting AnyConnect Cache Pre-Warm Daemon (Interval: ${intervalSec}s)...`);
    
    const tick = async () => {
        try {
            await prewarmOnce();
        } catch (e: any) {
            console.error("[ANYCONNECT-PREWARM] Uncaught loop error:", e.message);
        }
        setTimeout(tick, intervalSec * 1000);
    };

    await tick();
}

main().catch(async (e) => {
    console.error("[ANYCONNECT-PREWARM] Fatal:", e);
    await prisma.$disconnect();
    process.exit(1);
});
