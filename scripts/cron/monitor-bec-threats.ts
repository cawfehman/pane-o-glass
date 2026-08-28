import { PrismaClient } from "@prisma/client";
import path from "path";
import dotenv from "dotenv";
import { OgGraylogClient, classifyM365Url, unwrapUrl, parseDomain, OFFICIAL_M365_AUTH_ENDPOINTS, classifyOAuthProvider } from "../../src/lib/og-graylog";
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
        let isBackfill = false;
        let windowSeconds = process.env.BEC_LOOKBACK_SECONDS ? parseInt(process.env.BEC_LOOKBACK_SECONDS, 10) : 75;

        for (const arg of process.argv) {
            if (arg.startsWith('--backfill')) {
                isBackfill = true;
                const val = arg.split('=')[1];
                if (val) {
                    if (val.endsWith('d')) {
                        const d = parseInt(val.replace('d', ''), 10);
                        if (!isNaN(d)) windowSeconds = d * 86400;
                    } else if (val.endsWith('h')) {
                        const h = parseInt(val.replace('h', ''), 10);
                        if (!isNaN(h)) windowSeconds = h * 3600;
                    } else {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) windowSeconds = parsed > 365 ? parsed : parsed * 86400;
                    }
                } else {
                    windowSeconds = 86400;
                }
            } else if (arg.startsWith('--days=')) {
                isBackfill = true;
                const d = parseInt(arg.split('=')[1], 10);
                if (!isNaN(d)) windowSeconds = d * 86400;
            } else if (arg.startsWith('--hours=')) {
                isBackfill = true;
                const h = parseInt(arg.split('=')[1], 10);
                if (!isNaN(h)) windowSeconds = h * 3600;
            }
        }

        const query = `_exists_:esa_url_rep_score OR message:"devicelogin" OR message:"authorize" OR message:"oauth" OR message:"microsoft" OR message:"office365" OR message:"login.microsoftonline" OR message:"okta.com" OR message:"google.com" OR message:"docusign" OR message:"sharepoint" OR message:"outlook.com" OR message:"forms.office"`;
        const displayDays = (windowSeconds / 86400).toFixed(1);
        console.log(`[BEC Monitor] Starting Ingestion (Window: ${windowSeconds}s / ~${displayDays} days, Backfill: ${isBackfill})...`);

        if (windowSeconds > 300) {
            const chunkSeconds = 300; // 5-minute chunks guarantee max volume per window stays well under Elasticsearch 10k offset limit
            const numChunks = Math.max(1, Math.ceil(windowSeconds / chunkSeconds));
            const nowSec = Math.floor(Date.now() / 1000);
            console.log(`[BEC Monitor Backfill] Processing ${numChunks} 5-minute time blocks sequentially across ${displayDays} days...`);

            for (let i = 0; i < numChunks; i++) {
                const chunkStartSec = nowSec - windowSeconds + (i * chunkSeconds);
                const chunkEndSec = Math.min(nowSec, chunkStartSec + chunkSeconds);
                const fromIso = new Date(chunkStartSec * 1000).toISOString();
                const toIso = new Date(chunkEndSec * 1000).toISOString();

                const chunkHits = await client.searchAllAbsoluteMessagesPaginated(query, fromIso, toIso, 2500, 9900).catch(() => []);
                const pagesCount = Math.ceil(chunkHits.length / 2500);
                const pageDetail = pagesCount > 1 ? ` across ${pagesCount} paged requests (0..${chunkHits.length})` : '';
                console.log(`[BEC Backfill] Block ${i + 1}/${numChunks} (${fromIso.slice(11, 16)} -> ${toIso.slice(11, 16)}): ${chunkHits.length} events retrieved${pageDetail}.`);

                const rawUrlsToCreate: any[] = [];
                const incidentsToCreate: any[] = [];
                const seenKeys = new Set<string>();

                for (const h of chunkHits) {
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

                        const key = `${mid}_${destUrl}`;
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            const { isOauth, provider: providerName } = classifyOAuthProvider(destUrl, host);
                            rawUrlsToCreate.push({
                                mid,
                                rfcMessageId: rfcId,
                                subject,
                                sender,
                                recipient,
                                targetHost: host,
                                destUrl,
                                isOauth,
                                provider: providerName,
                                score: wrsScore,
                                createdAt: new Date(h.message.timestamp || Date.now())
                            });
                        }

                        const analysis = classifyM365Url(rawUrl, sender, OFFICIAL_M365_AUTH_ENDPOINTS, wrsScore);
                        if (analysis && analysis.impersonationBoost > 0) {
                            incidentsToCreate.push({
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
                                createdAt: new Date(h.message.timestamp || Date.now())
                            });
                        }
                    }
                }

                if (rawUrlsToCreate.length > 0) {
                    const res = await prisma.becRawUrl.createMany({
                        data: rawUrlsToCreate,
                        skipDuplicates: true
                    }).catch(() => ({ count: 0 }));
                    urlsIngested += res.count || 0;
                }

                if (incidentsToCreate.length > 0) {
                    const res = await prisma.becIncident.createMany({
                        data: incidentsToCreate,
                        skipDuplicates: true
                    }).catch(() => ({ count: 0 }));
                    incidentsCount += res.count || 0;
                }
            }

            const durationMs = Date.now() - startTime;
            console.log(`[BEC Backfill Complete] Ingested total ${urlsIngested} URLs & ${incidentsCount} threats across ${numChunks} hours in ${(durationMs / 1000).toFixed(1)}s.`);

            await prisma.backgroundJob.upsert({
                where: { name: "BEC 24x7 Threat Monitor" },
                create: {
                    name: "BEC 24x7 Threat Monitor",
                    status: "SUCCESS",
                    lastRun: new Date(),
                    message: `Backfill Complete (${displayDays}d): ${urlsIngested} URLs, ${incidentsCount} Incidents in ${(durationMs / 1000).toFixed(1)}s`
                },
                update: {
                    status: "SUCCESS",
                    lastRun: new Date(),
                    message: `Backfill Complete (${displayDays}d): ${urlsIngested} URLs, ${incidentsCount} Incidents in ${(durationMs / 1000).toFixed(1)}s`
                }
            });

            return;
        }

        let becHits: any[] = [];
        let fromIso = "";
        let toIso = new Date().toISOString();

        if (!isBackfill) {
            // High-Watermark Checkpoint Ingestion Engine:
            // Fetch the last successful run timestamp from PostgreSQL to query the exact delta window.
            const job = await prisma.backgroundJob.findUnique({
                where: { name: "BEC 24x7 Threat Monitor" }
            }).catch(() => null);

            const now = Date.now();
            let fromTime = now - 300000; // 5-minute initial seed window

            if (job && job.lastRun) {
                const lastRunTime = new Date(job.lastRun).getTime();
                // If lastRun is within the last 30 minutes, use it (with a 10s safety overlap)
                if (now - lastRunTime < 1800000 && lastRunTime < now) {
                    fromTime = lastRunTime - 10000; // 10s safety buffer for clock jitter
                }
            }

            fromIso = new Date(fromTime).toISOString();
            console.log(`[BEC Monitor Checkpoint] Ingesting delta window (${fromIso.slice(11, 19)} -> ${toIso.slice(11, 19)})...`);
            becHits = await client.searchAllAbsoluteMessagesPaginated(query, fromIso, toIso, 2500, 9900).catch(() => []);
            console.log(`[BEC Monitor] Ingested ${becHits.length} matching syslog events for window (${fromIso.slice(11, 19)} -> ${toIso.slice(11, 19)}).`);
        } else {
            becHits = await client.searchAllMessagesPaginated(query, windowSeconds, 2500, 50000).catch(() => []);
            console.log(`[BEC Monitor Backfill] Ingested ${becHits.length} matching syslog events across paginated Graylog calls.`);
        }

        const rawUrlsToCreate: any[] = [];
        const incidentsToCreate: any[] = [];
        const seenKeys = new Set<string>();

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

                const { isOauth, provider: providerName } = classifyOAuthProvider(destUrl, host);
                const key = `${mid}_${destUrl}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    rawUrlsToCreate.push({
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
                    });
                }

                const analysis = classifyM365Url(rawUrl, sender, OFFICIAL_M365_AUTH_ENDPOINTS, wrsScore);
                if (analysis && (analysis.isBecThreat || analysis.impersonationBoost > 0)) {
                    incidentsToCreate.push({
                        mid,
                        rfcMessageId: rfcId,
                        subject,
                        sender,
                        recipient,
                        targetHost: analysis.targetHost || host,
                        destUrl: analysis.destUrl || destUrl,
                        threatTier: analysis.threatTier || "LOW",
                        threatCategory: analysis.threatCategory || "SUSPICIOUS",
                        impersonationBoost: analysis.impersonationBoost || 0,
                        analysisReason: analysis.reason || ""
                    });
                }
            }
        }

        if (rawUrlsToCreate.length > 0) {
            const res = await prisma.becRawUrl.createMany({
                data: rawUrlsToCreate,
                skipDuplicates: true
            }).catch(() => ({ count: 0 }));
            urlsIngested += res.count || 0;
        }

        if (incidentsToCreate.length > 0) {
            const res = await prisma.becIncident.createMany({
                data: incidentsToCreate,
                skipDuplicates: true
            }).catch(() => ({ count: 0 }));
            incidentsCount += res.count || 0;
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
