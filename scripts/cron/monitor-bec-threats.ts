import { PrismaClient } from "@prisma/client";
import path from "path";
import dotenv from "dotenv";
import { OgGraylogClient, classifyM365Url, OFFICIAL_M365_AUTH_ENDPOINTS } from "../../src/lib/og-graylog";
import { sendNotificationMail } from "../../src/lib/smtp";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();
const DEFAULT_ALERT_RECIPIENT = "rivera-robert@cooperhealth.edu";

async function runBecMonitorCron() {
    const startTime = Date.now();
    let incidentsCount = 0;
    let alertsSent = 0;

    console.log(`[${new Date().toISOString()}] Starting 24x7 BEC Threat Monitor Cron Cycle...`);

    try {
        const client = new OgGraylogClient();
        // Query recent 10 minutes of inbound Graylog traffic
        const windowSeconds = 600;
        const becHits = await client.searchMessages(
            `message:"microsoft" OR message:"office365" OR message:"sharepoint" OR message:"login.microsoftonline" OR message:"outlook.com" OR message:"devicelogin" OR message:"forms.office"`,
            500,
            windowSeconds
        );

        console.log(`Ingested ${becHits.length} matching syslog events from last 10 minutes.`);

        for (const h of becHits) {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const urlMatch = raw.match(/https?:\/\/[^\s"'\)>]+/i) || raw.match(/URL\s+(['"]?)(\S+)\1/i);
            const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

            const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            if (!mid || !urlMatch) continue;

            let wrsScore = 0.0;
            if (h.message.esa_url_rep_score !== undefined) {
                wrsScore = parseFloat(h.message.esa_url_rep_score);
            } else if (repMatch) {
                wrsScore = parseFloat(repMatch[1]);
            }

            const rawUrl = urlMatch[0].startsWith("URL ") ? urlMatch[2] : urlMatch[0];
            const analysis = classifyM365Url(rawUrl, h.message.esa_mail_from || "", OFFICIAL_M365_AUTH_ENDPOINTS, wrsScore);

            if (analysis && analysis.impersonationBoost > 0) {
                incidentsCount++;
                const existing = await prisma.becIncident.findUnique({
                    where: {
                        mid_destUrl: {
                            mid,
                            destUrl: analysis.destUrl
                        }
                    }
                });

                if (!existing) {
                    const rfcId = h.message.esa_rfc_message_id || "";
                    const subject = h.message.esa_subject || "No Subject Header";
                    const sender = h.message.esa_mail_from || "unknown";
                    const recipient = h.message.esa_rcpt_to || "unknown";

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

        // Pre-compute and hydrate local SQLite DB Cache (BecStatsCache) for 1h and 24h windows
        for (const rSec of [3600, 86400]) {
            try {
                const becRes = await client.getM365BecThreatAggregations(rSec, 20);
                await (prisma as any).becStatsCache.upsert({
                    where: { rangeSeconds: rSec },
                    create: {
                        rangeSeconds: rSec,
                        totalEvaluatedMessages: becRes.totalEvaluatedMessages,
                        totalEvaluatedUrls: becRes.totalEvaluatedUrls,
                        becThreatsJson: JSON.stringify(becRes.becThreats || []),
                        topDomainsJson: JSON.stringify(becRes.topUnwrappedDomains || []),
                        oauthLinksJson: JSON.stringify(becRes.thirdPartyOAuthLinks || [])
                    },
                    update: {
                        totalEvaluatedMessages: becRes.totalEvaluatedMessages,
                        totalEvaluatedUrls: becRes.totalEvaluatedUrls,
                        becThreatsJson: JSON.stringify(becRes.becThreats || []),
                        topDomainsJson: JSON.stringify(becRes.topUnwrappedDomains || []),
                        oauthLinksJson: JSON.stringify(becRes.thirdPartyOAuthLinks || [])
                    }
                });
                console.log(`[BEC Monitor] Pre-computed & hydrated local DB cache (BecStatsCache) for ${rSec}s window.`);
            } catch (cacheErr: any) {
                console.error(`[BEC Monitor] DB Cache hydration error for ${rSec}s:`, cacheErr.message || cacheErr);
            }
        }

        const durationMs = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] BEC Monitor Cron Completed in ${durationMs}ms. Incidents evaluated: ${incidentsCount}, Alerts sent: ${alertsSent}`);

        // Update BackgroundJob status in Prisma
        await prisma.backgroundJob.upsert({
            where: { name: "M365 BEC Threat Monitor" },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Evaluated ${incidentsCount} threats, dispatched ${alertsSent} alert emails to ${DEFAULT_ALERT_RECIPIENT}. (${durationMs}ms)`
            },
            create: {
                name: "M365 BEC Threat Monitor",
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Evaluated ${incidentsCount} threats, dispatched ${alertsSent} alert emails to ${DEFAULT_ALERT_RECIPIENT}. (${durationMs}ms)`
            }
        });

    } catch (e: any) {
        console.error(`[CRON ERROR] BEC Monitor Cron failed:`, e.message || e);
        await prisma.backgroundJob.upsert({
            where: { name: "monitor-bec-threats" },
            update: {
                lastRun: new Date(),
                status: "FAILURE",
                message: e.message || String(e)
            },
            create: {
                name: "monitor-bec-threats",
                lastRun: new Date(),
                status: "FAILURE",
                message: e.message || String(e)
            }
        });
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    runBecMonitorCron();
}

export { runBecMonitorCron };
