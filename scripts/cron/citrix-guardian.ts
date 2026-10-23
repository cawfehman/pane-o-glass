import path from "path";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { runCitrixLoginAutoShunCycle } from "../../src/lib/netscaler-login-triage";
import { prisma } from "../../src/lib/prisma";

const originalLog = console.log;
const originalError = console.error;

function getLogFile() {
    const today = new Date().toISOString().split("T")[0];
    return path.resolve(__dirname, `citrix-guardian-${today}.log`);
}

function formatMsg(msg: any) {
    const ts = new Date().toISOString();
    return `[${ts}] [CITRIX-GUARDIAN] ${msg}`;
}

console.log = (...args) => {
    const msg = args.join(" ");
    const formatted = formatMsg(msg);
    originalLog(formatted);
    try {
        fs.appendFileSync(getLogFile(), formatted + "\n");
    } catch {}
};

console.error = (...args) => {
    const msg = args.join(" ");
    const formatted = formatMsg(msg);
    originalError(formatted);
    try {
        fs.appendFileSync(getLogFile(), formatted + "\n");
    } catch {}
};

async function executeOnce(forceRun = false) {
    const res = await runCitrixLoginAutoShunCycle({ forceRun });
    if (!res.executed) {
        console.log("Citrix Login Auto-Shun Guardian is currently PAUSED via configuration. Skipping cycle.");
        return;
    }
    console.log(
        `Cycle complete -> Evaluated: ${res.evaluatedIps} IPs | Newly Shunned: ${res.newlyShunned.length} | Protected: ${res.protectedCount} | Summary: ${res.summary}`
    );
    for (const item of res.newlyShunned) {
        console.log(
            `>>> [AUTO-SHUNNED] ${item.ip} (${item.countryCode} / ${item.asn} ${item.companyName}) | Reason: ${item.reason}`
        );
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isLoop = args.includes("--loop") || args.includes("-l");
    const forceRun = args.includes("--force");
    const intervalArg = args.find((a) => a.startsWith("--interval="));
    const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1], 10) || 120 : 120;

    if (isLoop) {
        console.log(`Starting Citrix Login Guardian in continuous loop mode (interval: ${intervalSec}s)...`);
        const tick = async () => {
            try {
                await executeOnce(forceRun);
            } catch (err: any) {
                console.error("Cycle error:", err.message);
            }
            setTimeout(tick, intervalSec * 1000);
        };
        await tick();
    } else {
        try {
            await executeOnce(forceRun);
        } catch (err: any) {
            console.error("Cycle error:", err.message);
        } finally {
            await prisma.$disconnect();
        }
    }
}

main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
});
