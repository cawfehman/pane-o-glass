import path from "path";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const CACHE_FILE = path.resolve(process.cwd(), ".anyconnect_sessions_cache.json");

async function resolvePythonCommand(): Promise<string> {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            await execFileAsync(cmd, ["--version"]);
            return cmd;
        } catch {}
    }
    return process.platform === "win32" ? "python" : "python3";
}

function resolveScriptPath(): string {
    const candidates = [
        path.resolve(__dirname, "../../services/firewall/ftd_client.py"),
        path.resolve(__dirname, "../services/firewall/ftd_client.py"),
        path.resolve(process.cwd(), "services/firewall/ftd_client.py")
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return path.resolve(process.cwd(), "services/firewall/ftd_client.py");
}

async function runFtdCli(args: string[]): Promise<any> {
    const pythonBin = await resolvePythonCommand();
    const scriptPath = resolveScriptPath();
    try {
        const { stdout } = await execFileAsync(pythonBin, [scriptPath, "--json", ...args], {
            cwd: process.cwd(),
            timeout: 75000,
            maxBuffer: 50 * 1024 * 1024,
            env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        return JSON.parse(stdout);
    } catch (err: any) {
        console.error("[ANYCONNECT-PREWARM] Python execution error:", err.message);
        throw err;
    }
}

async function prewarmOnce(): Promise<{ success: boolean; message: string }> {
    const t0 = Date.now();
    try {
        console.log(`[ANYCONNECT-PREWARM] Starting sweep across cluster nodes...`);
        const raw = await runFtdCli(["--action", "ra_sessions", "--target", "ra"]);
        const sessions: any[] = [];
        if (Array.isArray(raw)) {
            for (const r of raw) {
                if (r.success && Array.isArray(r.sessions)) {
                    sessions.push(...r.sessions);
                }
            }
        }

        // Deduplicate across HA / load-balanced cluster members
        const seen = new Set<string>();
        const deduplicated: any[] = [];
        for (const s of sessions) {
            const key = s.auditSessionId ? `${s.auditSessionId}` : `${s.username}-${s.assignedIp || s.publicIp}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(s);
            }
        }

        // Sort by throughput (highest traffic first)
        deduplicated.sort((a, b) => ((b.bytesTx || 0) + (b.bytesRx || 0)) - ((a.bytesTx || 0) + (a.bytesRx || 0)));

        const durationMs = Date.now() - t0;
        const result = {
            success: true,
            totalSessions: deduplicated.length,
            sessions: deduplicated,
            timestamp: new Date().toISOString()
        };

        // Persist to shared disk cache for Next.js web application
        try {
            const tmpFile = `${CACHE_FILE}.tmp.${Date.now()}`;
            fs.writeFileSync(tmpFile, JSON.stringify({ data: result, timestamp: Date.now() }), "utf-8");
            fs.renameSync(tmpFile, CACHE_FILE);
        } catch (cacheErr: any) {
            console.warn(`[ANYCONNECT-PREWARM] Note: Could not write cache file: ${cacheErr.message}`);
        }

        const msg = `Warmed ${deduplicated.length} active sessions across cluster nodes in ${durationMs}ms`;
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
