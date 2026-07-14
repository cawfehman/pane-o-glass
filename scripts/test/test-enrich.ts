import { enrichIpsBatch } from "../src/lib/iplocate";
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("Starting batch enrichment test with new IPs...");
    const ips = [
        "8.8.4.4",
        "1.1.1.1",
        "9.9.9.9",
        "4.2.2.2",
        "208.67.222.222"
    ];
    
    const results = await enrichIpsBatch(ips, true);
    console.log("Enrichment results keys:", Object.keys(results));

    const count = await prisma.ipLookupCache.count();
    console.log(`Current cached IP count in DB: ${count}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
