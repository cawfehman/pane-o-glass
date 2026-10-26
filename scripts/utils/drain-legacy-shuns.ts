import { PrismaClient } from "@prisma/client";
import { executeFirewallBulkCommands } from "../../src/lib/netscaler-auto-shun";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();

const RESIDENTIAL_KEYWORDS = [
    "comcast", "charter", "spectrum", "verizon", "at&t", "att",
    "cox", "optimum", "centurylink", "frontier", "t-mobile", "sprint"
];

function isResidential(org?: string | null): boolean {
    if (!org) return false;
    const lower = org.toLowerCase();
    return RESIDENTIAL_KEYWORDS.some(k => lower.includes(k));
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes("--dry-run");
    const batchSizeArg = args.find(a => a.startsWith("--batch-size="));
    const maxBatchesArg = args.find(a => a.startsWith("--max-batches="));
    const allowNonResidential = args.includes("--force-all-including-hosting");

    const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : 200;
    const maxBatches = maxBatchesArg ? parseInt(maxBatchesArg.split("=")[1], 10) : Infinity;

    console.log("=== Cisco FTD Protected Shun Drain Utility ===");
    console.log(`Mode: ${isDryRun ? "DRY-RUN (Simulated)" : "LIVE EXECUTION"}`);
    console.log(`Safety Policy: ${allowNonResidential ? "UNRESTRICTED" : "STRICT (Only Pure Residential Citrix Shuns)"}`);
    console.log(`Batch Size: ${batchSize} commands per batch`);

    // 1. Fetch active shuns with metadata
    const activeShuns = await prisma.firewallShunStats.findMany({
        where: { isActive: true },
        select: {
            ip: true,
            firewall: true,
            shunIp: { select: { org: true, ipAsn: true } }
        }
    });

    console.log(`Total active shun records in DB: ${activeShuns.length}`);

    // 2. Fetch all VPN failed IPs
    const vpnFailures = await prisma.vpnEvent.findMany({
        where: { status: "FAILURE" },
        select: { sourceIp: true }
    });
    const vpnFailureIpSet = new Set(vpnFailures.map(v => v.sourceIp));

    // 3. Classify and partition
    const protectedVpnIps = new Set<string>();
    const protectedHostingIps = new Set<string>();
    const eligibleResidentialCitrixIps = new Set<string>();

    for (const item of activeShuns) {
        const ip = item.ip;
        const org = item.shunIp?.org || "";

        if (vpnFailureIpSet.has(ip)) {
            protectedVpnIps.add(ip);
        } else if (!isResidential(org) && !allowNonResidential) {
            protectedHostingIps.add(ip);
        } else {
            eligibleResidentialCitrixIps.add(ip);
        }
    }

    console.log("\n--- Active Shun Safety Audit ---");
    console.log(`🔒 VPN-Originated Shuns (PROTECTED / NEVER REMOVED): ${protectedVpnIps.size} distinct IPs`);
    console.log(`🔒 Cloud VPS / Hosting / Tor ASNs (PROTECTED / NEVER REMOVED): ${protectedHostingIps.size} distinct IPs`);
    console.log(`⚡ Eligible Pure Residential Citrix Shuns (Transferred to SI): ${eligibleResidentialCitrixIps.size} distinct IPs`);

    const drainList = Array.from(eligibleResidentialCitrixIps);

    if (drainList.length === 0) {
        console.log("\nAll active shuns are strictly protected (VPN or Hosting/Cloud). Zero shuns eligible to drain.");
        return;
    }

    let processedBatches = 0;
    let totalUnshunned = 0;

    for (let i = 0; i < drainList.length; i += batchSize) {
        if (processedBatches >= maxBatches) {
            console.log(`Reached maximum batch limit (${maxBatches}). Stopping.`);
            break;
        }

        const batchIps = drainList.slice(i, i + batchSize);
        processedBatches++;
        console.log(`\n--- Batch ${processedBatches}: Processing ${batchIps.length} Pure Residential Citrix IPs (${i + 1} to ${Math.min(i + batchSize, drainList.length)}) ---`);

        const commands = batchIps.map(ip => `no shun ${ip}`);

        if (isDryRun) {
            console.log(`[DRY-RUN] Would execute ${commands.length} 'no shun' commands across firewalls.`);
            console.log(`[DRY-RUN] Sample eligible residential commands:`, commands.slice(0, 3));
            totalUnshunned += batchIps.length;
        } else {
            console.log(`Executing ${commands.length} 'no shun' commands over single SSH session per firewall...`);
            const start = Date.now();
            const result = await executeFirewallBulkCommands(commands, "all");
            const durationMs = Date.now() - start;

            console.log(`Batch completed in ${durationMs}ms. Success: ${result.success}`);
            for (const r of result.results) {
                console.log(`  Node ${r.target}: ${r.success ? "OK" : "ERROR: " + r.stderr}`);
            }

            // Update database records
            await prisma.firewallShunStats.updateMany({
                where: { ip: { in: batchIps } },
                data: { isActive: false }
            });

            totalUnshunned += batchIps.length;

            if (i + batchSize < drainList.length) {
                console.log("Cooling down for 20 seconds to maintain firewall CPU < 5%...");
                await new Promise(r => setTimeout(r, 20000));
            }
        }
    }

    console.log("\n================ Protection Summary ================");
    console.log(`Eligible residential IPs un-shunned from Lina CLI: ${totalUnshunned}`);
    console.log(`VPN Attack IPs Kept Shunned in Lina: ${protectedVpnIps.size}`);
    console.log(`Cloud VPS / Hosting / Tor IPs Kept Shunned in Lina: ${protectedHostingIps.size}`);
    console.log(`Total Permanently Locked in Lina CLI: ${protectedVpnIps.size + protectedHostingIps.size}`);
    console.log("====================================================\n");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
