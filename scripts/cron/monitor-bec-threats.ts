import { PrismaClient } from "@prisma/client";
import path from "path";
import dotenv from "dotenv";
import { OgGraylogClient, classifyM365Url, unwrapUrl, parseDomain, OFFICIAL_M365_AUTH_ENDPOINTS, OAUTH_IDENTITY_PATTERNS } from "../../src/lib/og-graylog";
import { sendNotificationMail } from "../../src/lib/smtp";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();
const DEFAULT_ALERT_RECIPIENT = "rivera-robert@cooperhealth.edu";

async function runBecMonitorCron() {
    const startTime = Date.now();
    let incidentsCount = 0;
    let alertsSent = 0;
    let urlsIngested = 0;

    console.log(`[${new Date().toISOString()}] Starting 24x7 BEC Threat Monitor Cron Cycle (75s Rolling Window)...`);

    try {
        const client = new OgGraylogClient();
        // Query recent 75 seconds of Graylog traffic with automatic multi-page offset pagination
        const windowSeconds = 75;
        const query = `message:"microsoft" OR message:"office365" OR message:"sharepoint" OR message:"login.microsoftonline" OR message:"outlook.com" OR message:"devicelogin" OR message:"forms.office"`;
        
        const becHits = await client.searchAllMessagesPaginated(query, windowSeconds, 2500, 50000);
        console.log(`[BEC Monitor] Ingested ${becHits.length} matching syslog events across paginated Graylog calls (Last ${windowSeconds}s).`);

        for (const h of becHits) {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const urlMatches = raw.match(/https?:\/\/[^\s"'\)>]+/gi) || [];
            const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

            const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            if (!mid || urlMatches.length === 0) continue;

            let wrsScore = 0.0;
            if (h.message.esa_url_rep_score !== undefined) {
                wrsScore = parseFloat(h.message.esa_url_rep_score);
            } else if (repMatch) {
                wrsScore = parseFloat(repMatch[1]);
            }

            const rfcId = h.message.esa_rfc_message_id || "";
            const subject = h.message.esa_subject || "No Subject Header";
            const sender = h.message.esa_mail_from || "unknown";
            const recipient = h.message.esa_rcpt_to || "unknown";

            for (const rawUrl of urlMatches) {
                const destUrl = unwrapUrl(rawUrl);
                const host = parseDomain(destUrl);
                if (!host) continue;

                // Check OAuth provider pattern
                let isOauth = false;
                let providerName: string | null = null;
                for (const pat of OAUTH_IDENTITY_PATTERNS) {
                    if (pat.pattern.test(destUrl)) {
                        isOauth = true;
                        providerName = pat.name;
                        break;
                    }
                }

                // 1. Ingest raw URL telemetry into SQLite (BecRawUrl)
                try {
                    await prisma.becRawUrl.upsert({
                        where: {
                            mid_destUrl: { mid, destUrl }
                        },
                        create: {
                            mid,
                            rfcMessageId: rfcId,
                            subject,
                            sender,
                            recipient,
                            targetHost: host,
                            destUrl,
                            isOauth,
                            provider: providerName,
                            score: wrsScore
                        },
                        update: {
                            score: wrsScore
                        }
                    });
                    urlsIngested++;
                } catch (e) {}

                // 2. Evaluate for BEC Threat Portals & Token Theft
                const analysis = classifyM365Url(rawUrl, sender, OFFICIAL_M365_AUTH_ENDPOINTS, wrsScore);
                if (analysis && analysis.impersonationBoost > 0) {
                    incidentsCount++;
                    const existing = await prisma.becIncident.findUnique({
                        where: {
                            mid_destUrl: { mid, destUrl: analysis.destUrl }
                        }
                    });

                    if (!existing) {
                        // Save to BecIncident table
                        const newIncident = await prisma.becIncident.create({
                            data: {
                                mid,
                                rfcMessageId: rfcId,
                                subject,
                                sender,
                                recipient,
                                targetHost: analysis.targetHost,
                                destUrl: analysis.destUrl,
                                threatTier: analysis.threatTier,
                                threatCategory: analysis.threatCategory,
                                impersonationBoost: analysis.impersonationBoost,
                                worstScore: wrsScore,
                                priorityScore: parseFloat((Math.abs(wrsScore) + analysis.impersonationBoost).toFixed(2)),
                                status: "UN_TRIAGED"
                            }
                        });

                        // Send Immediate Alert Email for CRITICAL & HIGH BEC Threats
                        if (analysis.threatTier === "CRITICAL" || analysis.threatTier === "HIGH") {
                            const emailSubject = `🚨 [Pane-O-Glass 24x7 BEC Alert] ${analysis.threatTier}: MID ${mid} - ${analysis.targetHost}`;
                            
                            const htmlBody = `
                                <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
                                    <div style="border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 16px;">
                                        <span style="background-color: #ef4444; color: #ffffff; padding: 4px 8px; font-weight: bold; border-radius: 4px; font-size: 12px;">
                                            ${analysis.threatTier} BEC INCIDENT DETECTED
                                        </span>
                                        <h2 style="color: #f8fafc; margin: 12px 0 4px 0;">M365 BEC / Impersonation Vector Alert</h2>
                                        <p style="color: #94a3b8; font-size: 13px; margin: 0;">24x7 Active Monitor Alert | Ingested via Cisco IronPort Edge</p>
                                    </div>

                                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8; width: 140px;"><strong>Gateway MID:</strong></td>
                                            <td style="padding: 8px 0; color: #38bdf8; font-family: monospace; font-weight: bold;">MID ${mid}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Threat Tier:</strong></td>
                                            <td style="padding: 8px 0; color: #f87171; font-weight: bold;">${analysis.threatCategory}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Priority Boost:</strong></td>
                                            <td style="padding: 8px 0; color: #fbbf24; font-weight: bold;">+${analysis.impersonationBoost.toFixed(1)} Boost (Composite Priority: ${(Math.abs(wrsScore) + analysis.impersonationBoost).toFixed(1)})</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Subject Line:</strong></td>
                                            <td style="padding: 8px 0; color: #f8fafc;">${subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Sender Address:</strong></td>
                                            <td style="padding: 8px 0; color: #38bdf8;">${sender}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Target Recipient:</strong></td>
                                            <td style="padding: 8px 0; color: #818cf8;">${recipient}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Target Host:</strong></td>
                                            <td style="padding: 8px 0; color: #fbbf24; font-family: monospace; font-weight: bold;">${analysis.targetHost}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #94a3b8;"><strong>Unwrapped Destination URL:</strong></td>
                                            <td style="padding: 8px 0; color: #f8fafc; font-family: monospace; word-break: break-all; font-size: 12px;">${analysis.destUrl}</td>
                                        </tr>
                                    </table>

                                    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155;">
                                        <a href="${process.env.NEXTAUTH_URL || 'https://paneoglass.cooperhealth.edu'}/queries/ironport?query=esa_mid:${mid}" style="background-color: #2563eb; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
                                            Trace MID in Pane-O-Glass
                                        </a>
                                    </div>
                                </div>
                            `;

                            try {
                                const res = await sendNotificationMail({
                                    to: DEFAULT_ALERT_RECIPIENT,
                                    subject: emailSubject,
                                    html: htmlBody
                                });

                                if (res && res.success) {
                                    alertsSent++;
                                    await prisma.becIncident.update({
                                        where: { id: newIncident.id },
                                        data: {
                                            alertSentAt: new Date(),
                                            alertRecipient: DEFAULT_ALERT_RECIPIENT
                                        }
                                    });

                                    // Log to Audit Table
                                    await prisma.auditLog.create({
                                        data: {
                                            action: "BEC_ALERT_EMAIL_DISPATCHED",
                                            details: `Dispatched 24x7 BEC ${analysis.threatTier} threat alert email for MID ${mid} (${analysis.targetHost}) to ${DEFAULT_ALERT_RECIPIENT}`,
                                            userId: "system-bec-daemon",
                                            ipAddress: "127.0.0.1"
                                        }
                                    });

                                    console.log(`[ALERT DISPATCHED] Email sent to ${DEFAULT_ALERT_RECIPIENT} for MID ${mid} (MessageID: ${res.messageId})`);
                                }
                            } catch (mailErr: any) {
                                console.error(`[ALERT ERROR] Failed to send email for MID ${mid}:`, mailErr.message || mailErr);
                            }
                        }
                    }
                }
            }
        }

        // 3. Perform Fast Local SQLite DB Aggregations for all 6 UI timeframe windows (10m, 30m, 1h, 4h, 12h, 24h)
        for (const rSec of [600, 1800, 3600, 14400, 43200, 86400]) {
            try {
                const cutoff = new Date(Date.now() - rSec * 1000);
                const rawUrls = await prisma.becRawUrl.findMany({
                    where: { createdAt: { gte: cutoff } }
                });

                const uniqueMids = new Set(rawUrls.map(u => u.mid));
                const totalEvaluatedMessages = uniqueMids.size;
                const totalEvaluatedUrls = rawUrls.length;

                // Aggregate Top Domains
                const domainCounts: Record<string, number> = {};
                rawUrls.forEach(u => {
                    domainCounts[u.targetHost] = (domainCounts[u.targetHost] || 0) + 1;
                });

                const sortedDomains = Object.entries(domainCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([domain, count]) => ({
                        domain,
                        count,
                        percentage: totalEvaluatedUrls > 0 ? `${((count / totalEvaluatedUrls) * 100).toFixed(1)}%` : "0%"
                    }));

                // Aggregate OAuth Providers
                const oauthUrls = rawUrls.filter(u => u.isOauth && u.provider);
                const oauthGroupMap: Record<string, any> = {};
                oauthUrls.forEach(u => {
                    const prov = u.provider!;
                    if (!oauthGroupMap[prov]) {
                        oauthGroupMap[prov] = {
                            provider: prov,
                            count: 0,
                            recipients: new Set(),
                            hosts: new Set(),
                            items: []
                        };
                    }
                    oauthGroupMap[prov].count++;
                    if (u.recipient) oauthGroupMap[prov].recipients.add(u.recipient);
                    oauthGroupMap[prov].hosts.add(u.targetHost);
                    oauthGroupMap[prov].items.push({
                        mid: u.mid,
                        recipient: u.recipient,
                        sender: u.sender,
                        subject: u.subject,
                        host: u.targetHost,
                        destUrl: u.destUrl,
                        timestamp: u.createdAt.toISOString()
                    });
                });

                const sortedOauth = Object.values(oauthGroupMap).map((g: any) => ({
                    provider: g.provider,
                    count: g.count,
                    percentage: totalEvaluatedUrls > 0 ? `${((g.count / totalEvaluatedUrls) * 100).toFixed(1)}%` : "0%",
                    uniqueRecipientsCount: g.recipients.size,
                    topHosts: Array.from(g.hosts).slice(0, 3),
                    items: g.items
                })).sort((a, b) => b.count - a.count);

                // Upsert into BecStatsCache in SQLite (<1ms!)
                await (prisma as any).becStatsCache.upsert({
                    where: { rangeSeconds: rSec },
                    create: {
                        rangeSeconds: rSec,
                        totalEvaluatedMessages,
                        totalEvaluatedUrls,
                        becThreatsJson: "[]",
                        topDomainsJson: JSON.stringify(sortedDomains),
                        oauthLinksJson: JSON.stringify(sortedOauth)
                    },
                    update: {
                        totalEvaluatedMessages,
                        totalEvaluatedUrls,
                        topDomainsJson: JSON.stringify(sortedDomains),
                        oauthLinksJson: JSON.stringify(sortedOauth)
                    }
                });
            } catch (cacheErr: any) {
                console.error(`[BEC Monitor] Local DB Cache aggregation error for ${rSec}s:`, cacheErr.message || cacheErr);
            }
        }

        const durationMs = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] BEC Monitor Cron Completed in ${durationMs}ms. Ingested URLs: ${urlsIngested}, Incidents evaluated: ${incidentsCount}, Alerts sent: ${alertsSent}`);

        // Update BackgroundJob status in Prisma
        await prisma.backgroundJob.upsert({
            where: { name: "BEC 24x7 Threat Monitor" },
            create: {
                name: "BEC 24x7 Threat Monitor",
                status: "SUCCESS",
                lastRun: new Date(),
                message: `Ingested URLs: ${urlsIngested}, Incidents: ${incidentsCount}, Alerts: ${alertsSent} in ${durationMs}ms`
            },
            update: {
                status: "SUCCESS",
                lastRun: new Date(),
                message: `Ingested URLs: ${urlsIngested}, Incidents: ${incidentsCount}, Alerts: ${alertsSent} in ${durationMs}ms`
            }
        });

    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] BEC Monitor Cron Failure:`, error);
        await prisma.backgroundJob.upsert({
            where: { name: "BEC 24x7 Threat Monitor" },
            create: {
                name: "BEC 24x7 Threat Monitor",
                status: "FAILED",
                lastRun: new Date(),
                message: error.message || String(error)
            },
            update: {
                status: "FAILED",
                lastRun: new Date(),
                message: error.message || String(error)
            }
        });
    } finally {
        await prisma.$disconnect();
    }
}

// Execute daemon loop if called directly via CLI
if (require.main === module) {
    runBecMonitorCron()
        .then(() => process.exit(0))
        .catch(err => {
            console.error("BEC Monitor Error:", err);
            process.exit(1);
        });
}

export { runBecMonitorCron };
