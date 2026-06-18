const { PrismaClient } = require('@prisma/client');
const path = require('path');
const https = require('https');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function backfillAssignedIps() {
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (!rawUrl || !rawToken) {
        console.error("Graylog configuration missing in .env");
        process.exit(1);
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    const streamIds = rawStreams ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean) : [];

    // Query specifically for the IP lease syslog message class
    const signatures = '(MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051)';
    const authHeader = token.includes(":") 
        ? `Basic ${Buffer.from(token).toString("base64")}`
        : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Determine custom day range (defaults to 30 days)
    let daysToSync = 30;
    const args = process.argv.slice(2);
    const parsedDays = parseInt(args[0], 10);
    if (!isNaN(parsedDays) && parsedDays > 0) {
        daysToSync = parsedDays;
    }

    console.log(`Starting IP assignment backfill for the last ${daysToSync} days...`);
    let totalUpdated = 0;

    const ipAssignRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>\s+(?:IPv4\s+)?Address\s+<([^>]+)>(?:\s+IPv6\s+address\s+<[^>]*>)?\s+assigned\s+to\s+session|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+),\s*(?:IPv4\s*)?Address\s*=\s*([^\s,]+)(?:\s*,\s*IPv6\s*address\s*=\s*[^\s,]+)?\s*assigned\s*to\s*session)/i;

    for (let dayOffset = daysToSync; dayOffset >= 0; dayOffset--) {
        const toDate = new Date();
        toDate.setDate(toDate.getDate() - dayOffset);
        
        const fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 1);

        const fromIso = fromDate.toISOString();
        const toIso = toDate.toISOString();

        console.log(`\nFetching 722051 leases from: ${fromIso} to: ${toIso}...`);

        try {
            const searchUrl = `${url}/api/search/universal/absolute`;
            const params = new URLSearchParams();
            params.append("query", signatures);
            params.append("from", fromIso);
            params.append("to", toIso);
            params.append("limit", "5000");
            params.append("decorate", "false");
            for (const streamId of streamIds) {
                params.append("filter", `streams:${streamId}`);
            }

            const response = await axios.get(searchUrl, {
                params,
                headers: {
                    "Authorization": authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                httpsAgent: agent,
                timeout: 30000
            });

            const messages = response.data?.messages || [];
            console.log(`Fetched ${messages.length} lease messages for this period.`);

            let updatedThisPeriod = 0;

            for (const msgObj of messages) {
                const rawLog = msgObj.message?.message || "";
                const logTimestampStr = msgObj.message?.timestamp;
                if (!rawLog || !logTimestampStr) continue;

                const match = rawLog.match(ipAssignRegex);
                if (match) {
                    const username = match[2] || match[6];
                    const sourceIp = match[3] || match[7];
                    const assignedIp = match[4] || match[8];
                    
                    const logTimestamp = new Date(logTimestampStr);
                    const fiveSeconds = 5 * 1000;
                    const rangeStart = new Date(logTimestamp.getTime() - fiveSeconds);
                    const rangeEnd = new Date(logTimestamp.getTime() + fiveSeconds);

                    // Find existing SUCCESS or DISCONNECT record matching username, public source IP, and timestamp
                    const existing = await prisma.vpnEvent.findFirst({
                        where: {
                            username,
                            sourceIp,
                            status: { in: ["SUCCESS", "DISCONNECT"] },
                            createdAt: {
                                gte: rangeStart,
                                lte: rangeEnd
                            }
                        }
                    });

                    if (existing) {
                        if (!existing.assignedIp) {
                            await prisma.vpnEvent.update({
                                where: { id: existing.id },
                                data: { assignedIp }
                            });
                            updatedThisPeriod++;
                        }
                    } else {
                        // If no corresponding connect/disconnect event was captured, let's create a stub success event so we still track this session lease
                        // Use the local lite check instead of direct importing typescript
                        let ipInfo = null;

                        await prisma.vpnEvent.create({
                            data: {
                                username,
                                sourceIp,
                                assignedIp,
                                status: "SUCCESS",
                                ipAsn: ipInfo?.asn || null,
                                ipAsName: ipInfo?.as_name || null,
                                ipAsDomain: ipInfo?.as_domain || null,
                                ipCountry: ipInfo?.country || null,
                                ipCountryCode: ipInfo?.country_code || null,
                                createdAt: logTimestamp
                            }
                        });
                        updatedThisPeriod++;
                    }
                }
            }

            console.log(`Matched and updated/created ${updatedThisPeriod} events.`);
            totalUpdated += updatedThisPeriod;

        } catch (err) {
            console.error(`Error backfilling for dayOffset ${dayOffset}:`, err.message);
        }
    }

    console.log(`\nBackfill completed. Processed ${totalUpdated} IP assignments.`);
}

backfillAssignedIps()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
