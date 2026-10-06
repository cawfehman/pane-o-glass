import { syncFmcFirewallsToCrawler } from "@/lib/fmc-crawler-sync";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
    console.log("Starting FMC Firewall synchronization to Network Crawler & Site Manager...");
    try {
        const result = await syncFmcFirewallsToCrawler("cli-runner");
        console.log("=== SYNC SUCCESSFUL ===");
        console.log("Total Firewalls Synced:", result.syncedDevicesCount);
        console.log("Total Routes Ingested:", result.syncedRoutesCount);
        console.log("Sites Created in Site Directory:", result.sitesCreated.join(", ") || "(All sites already exist)");
        console.log("\nSynchronized Devices Summary:");
        result.devices.forEach((d, idx) => {
            console.log(` [${idx + 1}] ${d.name} | Site: ${d.site} | IP: ${d.ip} | Interfaces: ${d.interfacesCount} | Routes: ${d.routesCount}`);
        });
    } catch (err: any) {
        console.error("SYNC FAILED:", err.message);
        process.exit(1);
    }
}

main();
