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
    const signatures = '(MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051 OR MessageClass:FTD\\-6\\-750003)';
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
    const ikev2LeaseRegex = /Local:\s*[^\s]+\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+Group:\s*[^\s]+\s+(?:IPv4\s+)?Address:\s*<([^>]+)>/i;

    for (let dayOffset = daysToSync; dayOffset >= 0; dayOffset--) {
        const toDate = new Date();
        toDate.setDate(toDate.getDate() - dayOffset);
        
        const fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 1);

        const totalDurationMs = toDate.getTime() - fromDate.getTime();
        const chunkDurationMs = totalDurationMs / 3;

        let updatedThisDay = 0;

        for (let chunkIdx = 0; chunkIdx < 3; chunkIdx++) {
            const chunkFrom = new Date(fromDate.getTime() + (chunkIdx * chunkDurationMs));
            const chunkTo = new Date(fromDate.getTime() + ((chunkIdx + 1) * chunkDurationMs));
            const fromIso = chunkFrom.toISOString();
            const toIso = chunkTo.toISOString();

            console.log(`\nFetching 722051 leases (window ${chunkIdx + 1}/3) from: ${fromIso} to: ${toIso}...`);

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
                console.log(`Fetched ${messages.length} lease messages for window ${chunkIdx + 1}/3.`);

                // Pre-fetch all events in this 8h window (+5s safety buffers) in a single query
                const chunkStartBuffer = new Date(chunkFrom.getTime() - 5000);
                const chunkEndBuffer = new Date(chunkTo.getTime() + 5000);
                const existingEvents = await prisma.vpnEvent.findMany({
                    where: {
                        createdAt: {
                            gte: chunkStartBuffer,
                            lte: chunkEndBuffer
                        }
                    }
                });

                const operations = [];

                for (const msgObj of messages) {
                    const rawLog = msgObj.message?.message || "";
                    const logTimestampStr = msgObj.message?.timestamp;
                    if (!rawLog || !logTimestampStr) continue;

                    let username = "";
                    let sourceIp = "";
                    let assignedIp = "";
                    let matched = false;

                    const match = rawLog.match(ipAssignRegex);
                    if (match) {
                        username = match[2] || match[6];
                        sourceIp = match[3] || match[7];
                        assignedIp = match[4] || match[8];
                        matched = true;
                    } else {
                        const ikeMatch = rawLog.match(ikev2LeaseRegex);
                        if (ikeMatch) {
                            sourceIp = ikeMatch[1];
                            username = ikeMatch[2];
                            assignedIp = ikeMatch[3];
                            matched = true;
                        }
                    }

                    if (matched) {
                        const logTimestamp = new Date(logTimestampStr);
                        const fiveSeconds = 5 * 1000;
                        const rangeStart = logTimestamp.getTime() - fiveSeconds;
                        const rangeEnd = logTimestamp.getTime() + fiveSeconds;

                        // Find existing SUCCESS or DISCONNECT record matching username, public source IP, and timestamp in memory
                        const existing = existingEvents.find(e => 
                            e.username === username &&
                            e.sourceIp === sourceIp &&
                            (e.status === "SUCCESS" || e.status === "DISCONNECT") &&
                            e.createdAt.getTime() >= rangeStart &&
                            e.createdAt.getTime() <= rangeEnd
                        );

                        if (existing) {
                            if (!existing.assignedIp) {
                                if (existing.isMock) {
                                    existing.dataRef.assignedIp = assignedIp;
                                }
                                if (!existing.isMock) {
                                    const vpnType = rawLog.match(ikev2LeaseRegex) ? "IKEv2" : "SSL";
                                    operations.push(prisma.vpnEvent.update({
                                        where: { id: existing.id },
                                        data: { assignedIp, vpnType }
                                    }));
                                }
                                existing.assignedIp = assignedIp;
                                updatedThisDay++;
                            }
                        } else {
                            // If no corresponding connect/disconnect event was captured, let's create a stub success event so we still track this session lease
                            let ipInfo = null;
                            const vpnType = rawLog.match(ikev2LeaseRegex) ? "IKEv2" : "SSL";

                            const dataObj = {
                                username,
                                sourceIp,
                                assignedIp,
                                status: "SUCCESS",
                                vpnType,
                                ipAsn: ipInfo?.asn || null,
                                ipAsName: ipInfo?.as_name || null,
                                ipAsDomain: ipInfo?.as_domain || null,
                                ipCountry: ipInfo?.country || null,
                                ipCountryCode: ipInfo?.country_code || null,
                                createdAt: logTimestamp
                            };

                            const createdMock = {
                                username,
                                sourceIp,
                                assignedIp,
                                status: "SUCCESS",
                                vpnType,
                                createdAt: logTimestamp,
                                isMock: true,
                                dataRef: dataObj
                            };

                            operations.push(prisma.vpnEvent.create({
                                data: dataObj
                            }));
                            existingEvents.push(createdMock);
                            updatedThisDay++;
                        }
                    }
                }

                if (operations.length > 0) {
                    console.log(`Executing ${operations.length} database operations in a transaction...`);
                    await prisma.$transaction(operations);
                }
            } catch (err) {
                console.error(`Error backfilling for dayOffset ${dayOffset} (window ${chunkIdx + 1}/3):`, err.message);
            }
        }

        console.log(`Matched and updated/created ${updatedThisDay} events for this day.`);
        totalUpdated += updatedThisDay;
    }

    console.log(`\nBackfill completed. Processed ${totalUpdated} IP assignments.`);
}

backfillAssignedIps()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
