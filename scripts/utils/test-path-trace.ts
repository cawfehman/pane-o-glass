import { PrismaClient } from "@prisma/client";
import { NativePathTracer } from "@/lib/crawler/tracer";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function runTests() {
    console.log("=== Testing NativePathTracer with Live Firewalls & Routing Tables ===");

    const snapshot = await prisma.crawlSnapshot.findFirst({
        orderBy: { snapshotNumber: "desc" },
        include: { devices: true }
    });

    if (!snapshot) {
        console.error("No crawl snapshot found.");
        return;
    }

    console.log(`Using Snapshot #${snapshot.snapshotNumber} (${snapshot.devices.length} devices in topology)`);
    const tracer = new NativePathTracer(snapshot.devices);

    const testCases = [
        {
            title: "Trace 1: Internal Workstation -> Public Internet (Google DNS 8.8.8.8)",
            src: "192.168.255.250",
            dst: "8.8.8.8"
        },
        {
            title: "Trace 2: Internal Host -> S2S VPN Partner: CHOP (159.14.72.219)",
            src: "192.168.255.250",
            dst: "159.14.72.219"
        },
        {
            title: "Trace 3: Internal Host -> Infor Cloud S2S Subnet (159.172.198.50)",
            src: "192.168.255.250",
            dst: "159.172.198.50"
        },
        {
            title: "Trace 4: Reverse Path: Perimeter Firewall -> Internal Epic Core Subnet (172.18.23.13)",
            src: "162.252.231.231",
            dst: "172.18.23.13"
        }
    ];

    for (const tc of testCases) {
        console.log("\n------------------------------------------------------------");
        console.log(tc.title);
        console.log(`Source: ${tc.src}  --->  Destination: ${tc.dst}`);
        console.log("------------------------------------------------------------");

        try {
            const res = tracer.trace(snapshot.id, tc.src, tc.dst);
            console.log(`Delivered: ${res.delivered ? "✅ YES" : "❌ NO"}`);
            console.log(`Summary: ${res.message}`);
            console.log(`Hops Count: ${res.hops.length}`);

            res.hops.forEach((h, idx) => {
                console.log(` [Hop ${h.hopNumber}] ${h.deviceName} (${h.role})`);
                console.log(`       Ingress: ${h.ingressInterface || 'N/A'}`);
                console.log(`       Matched Route: ${h.matchedRoute || 'N/A'} (Protocol: ${h.routeProtocol || 'N/A'})`);
                console.log(`       Next Hop IP: ${h.nextHopIp || 'N/A'}`);
                console.log(`       Egress Interface: ${h.egressInterface || 'N/A'}`);
                console.log(`       Forwarding Type: ${h.forwardingType}`);
                if (h.notes) console.log(`       Notes: ${h.notes}`);
            });
        } catch (err: any) {
            console.error(`Trace error: ${err.message}`);
        }
    }
}

runTests().finally(() => prisma.$disconnect());
