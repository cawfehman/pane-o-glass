const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testEnrich() {
    const ip = '95.164.206.108';
    console.log("Fetching live enrichment for", ip, "...");

    const apiKey = process.env.IPLOCATE_API_KEY;
    const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
        headers: apiKey ? { "X-API-KEY": apiKey } : {},
        timeout: 5000
    }).catch(err => ({ error: err.message }));

    if (res.data) {
        console.log("Live iplocate.io Response:", res.data);

        const data = res.data;
        const ipAsn = data.asn?.asn || data.asn || null;
        const ipAsName = data.asn?.name || data.company?.name || data.org || null;
        const ipAsDomain = data.asn?.domain || data.company?.domain || null;
        const ipCountry = data.country || null;
        const ipCountryCode = data.country_code || null;

        console.log("\nNormalized data:", { ipAsn, ipAsName, ipAsDomain, ipCountry, ipCountryCode });

        // Upsert into IpLookupCache
        await prisma.ipLookupCache.upsert({
            where: { ip },
            update: {
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                countryCode: ipCountryCode,
                city: data.city || null,
                subdivision: data.subdivision || null,
                rawJson: JSON.stringify(data)
            },
            create: {
                ip,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                countryCode: ipCountryCode,
                city: data.city || null,
                subdivision: data.subdivision || null,
                rawJson: JSON.stringify(data)
            }
        });

        // Update all VpnEvents for this IP
        const updated = await prisma.vpnEvent.updateMany({
            where: { sourceIp: ip },
            data: { ipAsn, ipAsName, ipAsDomain, ipCountry, ipCountryCode }
        });

        console.log(`\nSuccessfully updated ${updated.count} VpnEvent rows in PostgreSQL!`);
    } else {
        console.error("Failed to fetch live enrichment:", res.error);
    }
}

testEnrich().finally(() => prisma.$disconnect());
