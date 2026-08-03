import { PrismaClient } from '@prisma/client';
import { enrichIpsBatch } from '../src/lib/iplocate';

const prisma = new PrismaClient();

async function run() {
    console.log("--- Starting Historical Seed Migration ---");
    
    // IP -> { firstSeen, lastSeen, firewalls: Set }
    const masterIps = new Map<string, { firstSeen: Date, lastSeen: Date, firewalls: Set<string> }>();
    
    // Key: "IP|FIREWALL" -> { firstSeen, lastSeen, daysShunned }
    const statsMap = new Map<string, { firstSeen: Date, lastSeen: Date, datesSeen: Set<string> }>();

    function processEvent(ip: string, fw: string, date: Date) {
        if (!ip) return;
        const firewall = fw || "Unknown Firewall";
        
        // Update Master
        if (!masterIps.has(ip)) {
            masterIps.set(ip, { firstSeen: date, lastSeen: date, firewalls: new Set([firewall]) });
        } else {
            const m = masterIps.get(ip)!;
            if (date < m.firstSeen) m.firstSeen = date;
            if (date > m.lastSeen) m.lastSeen = date;
            m.firewalls.add(firewall);
        }

        // Update Stats
        const statKey = `${ip}|${firewall}`;
        const dateString = date.toISOString().split('T')[0];
        
        if (!statsMap.has(statKey)) {
            statsMap.set(statKey, { firstSeen: date, lastSeen: date, datesSeen: new Set([dateString]) });
        } else {
            const s = statsMap.get(statKey)!;
            if (date < s.firstSeen) s.firstSeen = date;
            if (date > s.lastSeen) s.lastSeen = date;
            s.datesSeen.add(dateString);
        }
    }

    console.log("Fetching GuardianEvents...");
    const guardianEvents = await prisma.guardianEvent.findMany();
    for (const ev of guardianEvents) {
        processEvent(ev.ip, ev.firewall || "", ev.createdAt);
    }
    console.log(`Processed ${guardianEvents.length} Guardian events.`);

    console.log("Fetching FirewallQueryHistory...");
    const queryEvents = await prisma.firewallQueryHistory.findMany({
        where: { command: { contains: "Shun" } }
    });
    for (const q of queryEvents) {
        processEvent(q.targetIp, q.targetName || "", q.createdAt);
    }
    console.log(`Processed ${queryEvents.length} Manual Query events.`);

    const totalIps = masterIps.size;
    console.log(`Found ${totalIps} unique historical IPs to migrate.`);

    if (totalIps === 0) {
        console.log("Nothing to seed. Exiting.");
        return;
    }

    console.log("Inserting Master IPs into database (isActive = false)...");
    for (const [ip, _] of masterIps) {
        await prisma.shunDatabaseIp.upsert({
            where: { ip },
            create: { ip },
            update: {}
        });
    }

    console.log("Inserting Firewall Stats...");
    for (const [key, data] of statsMap) {
        const [ip, firewall] = key.split('|');
        await prisma.firewallShunStats.upsert({
            where: {
                ip_firewall: { ip, firewall }
            },
            create: {
                ip,
                firewall,
                firstSeen: data.firstSeen,
                lastSeen: data.lastSeen,
                daysShunned: data.datesSeen.size,
                isActive: false // Default false for historicals
            },
            update: {
                firstSeen: data.firstSeen,
                lastSeen: data.lastSeen,
                daysShunned: data.datesSeen.size,
                isActive: false
            }
        });
    }

    // Now, massive enrichment!
    console.log(`\nBeginning IPLocate batch enrichment for ${totalIps} IPs...`);
    const allIps = Array.from(masterIps.keys());
    
    // Process in batches of 100 to avoid memory/network crashes
    const batchSize = 100;
    let enrichedCount = 0;

    for (let i = 0; i < allIps.length; i += batchSize) {
        const batch = allIps.slice(i, i + batchSize);
        console.log(`Enriching batch ${i} to ${i + batch.length}...`);
        
        const enrichmentResults = await enrichIpsBatch(batch, true);
        
        for (const ip of batch) {
            const data = enrichmentResults[ip];
            if (data && data.country_code) {
                const asnString = typeof data.asn === 'object' ? data.asn?.asn : data.asn;
                const orgString = typeof data.asn === 'object' ? (data.asn?.name || data.asn?.org || data.org) : data.org;
                
                await prisma.shunDatabaseIp.update({
                    where: { ip },
                    data: {
                        ipAsn: asnString ? String(asnString) : null,
                        org: orgString ? String(orgString) : null,
                        ipCountry: data.country,
                        ipCountryCode: data.country_code,
                        city: data.city,
                        continent: data.continent,
                        enrichedAt: new Date()
                    }
                });
                enrichedCount++;
            }
        }
        
        // Safety sequential throttle per batch
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n--- MIGRATION COMPLETE ---`);
    console.log(`Successfully migrated and enriched ${enrichedCount} out of ${totalIps} historical IPs!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
