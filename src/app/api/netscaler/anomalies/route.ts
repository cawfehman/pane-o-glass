import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { analyzeCitrixLoginTriage } from "@/lib/netscaler-login-triage";
import {
    syncAnomaliesToDatabase,
    dispatchOneClickAdvisory
} from "@/lib/login-anomaly-engine";
import { execute360BulkPardon } from "@/lib/reputation-pardon";
import { invalidateFeedCache } from "@/app/api/feeds/security-intelligence/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, "netscaler"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const statusFilter = searchParams.get("status") || "ALL";
        const decisionFilter = searchParams.get("decision") || "ALL";
        const search = searchParams.get("search")?.trim() || "";
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "25", 10)));
        const syncFromGraylog = searchParams.get("sync") === "true";
        const lookbackSeconds = parseInt(searchParams.get("lookback") || "604800", 10) || 604800; // default: 7 days

        // Optional on-the-fly Graylog sync
        if (syncFromGraylog) {
            try {
                const triage = await analyzeCitrixLoginTriage(lookbackSeconds);
                await syncAnomaliesToDatabase(triage.ipEvaluations);
            } catch (syncErr: any) {
                console.error("[Anomalies API] Graylog sync error:", syncErr.message);
            }
        }

        const where: any = {};

        if (statusFilter !== "ALL") {
            where.status = statusFilter;
        }

        if (decisionFilter !== "ALL") {
            where.currentDecision = decisionFilter;
        }

        if (search) {
            where.OR = [
                { ip: { contains: search, mode: "insensitive" } },
                { anchorUsername: { contains: search, mode: "insensitive" } },
                { anchorDisplayName: { contains: search, mode: "insensitive" } },
                { anchorDepartment: { contains: search, mode: "insensitive" } },
                { ispOrg: { contains: search, mode: "insensitive" } },
                { flagReason: { contains: search, mode: "insensitive" } },
                { suggestedTag: { contains: search, mode: "insensitive" } },
            ];
        }

        const [
            totalMatching,
            anomalies,
            pendingCount,
            blockedCount,
            allowedCount,
            acknowledgedCount
        ] = await Promise.all([
            prisma.citrixLoginAnomaly.count({ where }),
            prisma.citrixLoginAnomaly.findMany({
                where,
                orderBy: { lastSeen: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.citrixLoginAnomaly.count({ where: { status: "PENDING_REVIEW" } }),
            prisma.citrixLoginAnomaly.count({ where: { currentDecision: "BLOCKED", status: "PENDING_REVIEW" } }),
            prisma.citrixLoginAnomaly.count({ where: { currentDecision: "ALLOWED", status: "PENDING_REVIEW" } }),
            prisma.citrixLoginAnomaly.count({ where: { status: "ACKNOWLEDGED" } }),
        ]);

        return NextResponse.json({
            success: true,
            anomalies,
            counts: {
                totalMatching,
                pendingCount,
                blockedCount,
                allowedCount,
                acknowledgedCount
            },
            pagination: {
                page,
                pageSize,
                totalPages: Math.ceil(totalMatching / pageSize),
            }
        });
    } catch (err: any) {
        console.error("[Anomalies API] GET error:", err);
        return NextResponse.json(
            { error: "Failed to load authentication anomalies", details: err.message },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, "netscaler"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { action, id, ip, notes, justification, reason } = body;
        const username = (session.user as any)?.username || session.user?.name || "admin";
        const now = new Date();

        // 1. ACKNOWLEDGE ANOMALY (Close review without sending notification)
        if (action === "ACKNOWLEDGE") {
            if (!id && !ip) return NextResponse.json({ error: "Missing anomaly ID or IP" }, { status: 400 });

            const updated = await prisma.citrixLoginAnomaly.updateMany({
                where: id ? { id } : { ip },
                data: {
                    status: "ACKNOWLEDGED",
                    reviewedBy: username,
                    reviewedAt: now,
                    ...(notes ? { analystNotes: notes } : {})
                }
            });

            await logAudit(
                "CITRIX_ANOMALY_ACKNOWLEDGED",
                `Analyst ${username} acknowledged anomaly on ${ip || id}. Notes: "${notes || "Acknowledged as benign / reviewed"}". No notification sent.`,
                username,
                ip
            );

            return NextResponse.json({ success: true, updatedCount: updated.count });
        }

        // 2. PARDON AND ALLOW (Leave Unblocked / 360° Clear)
        if (action === "PARDON") {
            if (!ip) return NextResponse.json({ error: "Missing IP address for pardon" }, { status: 400 });

            const pardonReason = reason || `SOC Anomaly Review Pardon by ${username}`;
            const bulkResult = await execute360BulkPardon([ip], pardonReason, username, invalidateFeedCache);

            await prisma.citrixLoginAnomaly.updateMany({
                where: { ip },
                data: {
                    status: "PARDONED",
                    currentDecision: "ALLOWED",
                    decisionDetails: `Pardoned by ${username}: 0 strikes, 30-day immunity active.`,
                    reviewedBy: username,
                    reviewedAt: now,
                    ...(notes ? { analystNotes: notes } : {})
                }
            });

            return NextResponse.json({ ...bulkResult });
        }

        // 3. CONFIRM BLOCK / ENFORCE
        if (action === "ENFORCE_BLOCK") {
            if (!ip) return NextResponse.json({ error: "Missing IP address to block" }, { status: 400 });

            const blockReason = reason || `[Citrix Abuse Guard] Block confirmed via Anomaly Review by ${username}`;
            await prisma.guardianBlacklist.upsert({
                where: { ip },
                update: { reason: blockReason },
                create: { ip, reason: blockReason }
            });

            await prisma.citrixLoginAnomaly.updateMany({
                where: { ip },
                data: {
                    status: "BLOCKED",
                    currentDecision: "BLOCKED",
                    decisionDetails: `Confirmed Block: Added to Guardian Blacklist by ${username}.`,
                    reviewedBy: username,
                    reviewedAt: now,
                    ...(notes ? { analystNotes: notes } : {})
                }
            });

            await logAudit(
                "CITRIX_ANOMALY_CONFIRM_BLOCK",
                `Analyst ${username} confirmed block and added ${ip} to Guardian Blacklist.`,
                username,
                ip
            );

            return NextResponse.json({ success: true, ip, status: "BLOCKED" });
        }

        // 4. WHITELIST (Requires Mandatory Justification)
        if (action === "WHITELIST") {
            if (!ip) return NextResponse.json({ error: "Missing IP address to whitelist" }, { status: 400 });
            if (!justification || !justification.trim()) {
                return NextResponse.json({ error: "Whitelisting requires a mandatory business justification." }, { status: 400 });
            }

            const cleanJustification = justification.trim();

            // Add to GuardianWatchIp (our auto-unshun monitored whitelist)
            await prisma.guardianWatchIp.upsert({
                where: { ip },
                update: {
                    description: cleanJustification,
                    createdBy: username
                },
                create: {
                    ip,
                    description: cleanJustification,
                    createdBy: username
                }
            });

            // Set ledger status to WHITELISTED with 0 strikes
            await prisma.residentialStrikeLedger.upsert({
                where: { ip },
                update: {
                    status: "WHITELISTED",
                    strikeCount: 0,
                    pardonReason: `Whitelisted by ${username}: ${cleanJustification}`
                },
                create: {
                    ip,
                    status: "WHITELISTED",
                    strikeCount: 0,
                    targetPlatform: "CITRIX",
                    firstSeen: now,
                    lastSeen: now,
                    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    pardonReason: `Whitelisted by ${username}: ${cleanJustification}`
                }
            });

            // Also un-shun across firewalls if currently shunned
            await execute360BulkPardon([ip], `Whitelisted: ${cleanJustification}`, username, invalidateFeedCache);

            await prisma.citrixLoginAnomaly.updateMany({
                where: { ip },
                data: {
                    status: "WHITELISTED",
                    currentDecision: "ALLOWED",
                    decisionDetails: `Whitelisted on Guardian Watch List (${cleanJustification})`,
                    reviewedBy: username,
                    reviewedAt: now,
                    analystNotes: notes ? `${notes}\nJustification: ${cleanJustification}` : `Justification: ${cleanJustification}`
                }
            });

            await logAudit(
                "CITRIX_ANOMALY_WHITELISTED",
                `Analyst ${username} whitelisted ${ip} on Guardian Watch List. Justification: "${cleanJustification}"`,
                username,
                ip
            );

            return NextResponse.json({ success: true, ip, status: "WHITELISTED" });
        }

        // 5. SEND 1-CLICK ADVISORY NOTIFICATION VIA SMTP
        if (action === "SEND_ONE_CLICK_ADVISORY") {
            if (!id) return NextResponse.json({ error: "Anomaly ID is required to dispatch advisory" }, { status: 400 });

            const result = await dispatchOneClickAdvisory(id, username);
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    } catch (err: any) {
        console.error("[Anomalies API] POST error:", err);
        return NextResponse.json(
            { error: "Failed to execute anomaly review action", details: err.message },
            { status: 500 }
        );
    }
}
