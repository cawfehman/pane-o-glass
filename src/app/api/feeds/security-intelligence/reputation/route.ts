import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getReputationMetrics } from "@/lib/reputation-ledger";
import { drainFirewallQueue, enqueueFirewallCommand } from "@/lib/firewall-queue";
import { invalidateFeedCache } from "../route";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const userId = session.user.id;
    const [hasFw, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall", userId),
        hasPermission(role, "netscaler", userId)
    ]);
    return Boolean(hasFw || hasNetscaler);
}

// GET: Fetch reputation ledger metrics across requested timeframe with pagination & search
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const timeframe = url.searchParams.get("timeframe") || "24h";
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);
        const search = url.searchParams.get("search") || "";
        const statusFilter = url.searchParams.get("status") || "ALL";

        const [metrics, lastPollSetting] = await Promise.all([
            getReputationMetrics({ timeframe, page, pageSize, search, statusFilter }),
            prisma.netscalerCveSetting.findUnique({
                where: { key: "LAST_FMC_SI_POLL" }
            }).catch(() => null)
        ]);

        const lastPollDate = lastPollSetting?.value ? new Date(lastPollSetting.value) : null;
        let nextPollExpected: string | null = null;
        let secondsUntilNextPoll: number | null = null;

        if (lastPollDate && !isNaN(lastPollDate.getTime())) {
            const intervalMins = Math.max(5, parseInt(process.env.FMC_POLL_INTERVAL_MINUTES || "15", 10));
            const intervalMs = intervalMins * 60 * 1000;
            const elapsed = Date.now() - lastPollDate.getTime();
            const cyclesPassed = Math.max(0, Math.floor(elapsed / intervalMs));
            const nextPollMs = lastPollDate.getTime() + (cyclesPassed + 1) * intervalMs;
            nextPollExpected = new Date(nextPollMs).toISOString();
            secondsUntilNextPoll = Math.max(0, Math.round((nextPollMs - Date.now()) / 1000));
        }

        return NextResponse.json({
            success: true,
            fmcSync: {
                lastPoll: lastPollSetting?.value || null,
                nextPollExpected,
                secondsUntilNextPoll
            },
            metrics
        });
    } catch (err: any) {
        console.error("Reputation metrics error:", err);
        return NextResponse.json({ error: err.message || "Failed to load reputation metrics." }, { status: 500 });
    }
}

// POST: SOC Manual Actions (Pardon, Queue Drain, Manual Strike Promotion)
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { action, ip, reason } = body;
        const userId = (session.user as any)?.id || "admin";

        if (action === "DRAIN_QUEUE") {
            const limit = Math.min(Math.max(1, body.limit || 500), 1000);
            const result = await drainFirewallQueue(limit);
            return NextResponse.json({ success: true, action: "DRAIN_QUEUE", result });
        }

        if (action === "PARDON") {
            if (!ip || typeof ip !== "string") {
                return NextResponse.json({ error: "Target IP is required for pardon." }, { status: 400 });
            }

            const cleanIp = ip.trim();
            const now = new Date();
            const pardonReasonText = reason || `Manual SOC override pardon by ${userId}`;

            // 1. Upsert in ResidentialStrikeLedger with clean post-pardon state and verified Citrix success immunity
            await prisma.residentialStrikeLedger.upsert({
                where: { ip: cleanIp },
                update: {
                    status: "PARDONED",
                    strikeCount: 0,
                    isSpraySuspect: false,
                    attemptedUsers: [],
                    distinctUserCount: 0,
                    hasCitrixSuccess: true,
                    lastSuccessAt: now,
                    pardonReason: pardonReasonText
                },
                create: {
                    ip: cleanIp,
                    status: "PARDONED",
                    strikeCount: 0,
                    targetPlatform: "CITRIX",
                    isSpraySuspect: false,
                    attemptedUsers: [],
                    distinctUserCount: 0,
                    hasCitrixSuccess: true,
                    lastSuccessAt: now,
                    firstSeen: now,
                    lastSeen: now,
                    expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
                    pardonReason: pardonReasonText
                }
            }).catch(() => {});

            // 2. Remove from GuardianBlacklist so Citrix Auto-Guardian does not re-block on the next 2-minute cycle
            await prisma.guardianBlacklist.deleteMany({
                where: { ip: cleanIp }
            }).catch(() => {});

            // 3. Mark any active CVE Shuns as REMOVED
            await prisma.netscalerCveShun.updateMany({
                where: { ip: cleanIp },
                data: {
                    status: "REMOVED",
                    removedAt: now,
                    removedBy: userId,
                    notes: pardonReasonText
                }
            }).catch(() => {});

            // 4. Deactivate in FirewallShunStats
            await prisma.firewallShunStats.updateMany({
                where: { ip: cleanIp },
                data: { isActive: false }
            }).catch(() => {});

            // 5. Cancel any pending SHUN commands in FirewallCommandQueue
            await prisma.firewallCommandQueue.updateMany({
                where: { ip: cleanIp, status: "PENDING", action: "SHUN" },
                data: {
                    status: "COMPLETED",
                    executedAt: now,
                    lastError: `Cancelled: Manually pardoned by ${userId}`
                }
            }).catch(() => {});

            // 6. Invalidate Security Intelligence feed cache
            invalidateFeedCache();

            // 7. Enqueue unshun & drain immediately
            await enqueueFirewallCommand({
                ip: cleanIp,
                action: "UNSHUN",
                targetHost: "all",
                reason: `Manual SOC Pardon: ${reason || "SOC Analyst override"}`
            });
            await drainFirewallQueue(50).catch(() => {});

            await logAudit(
                "SOC_MANUAL_PARDON",
                `SOC analyst manually pardoned ${cleanIp} (cleared Ledger strikes, GuardianBlacklist, CVE shuns, and firewall shuns). Reason: ${reason || "Manual override"}`,
                userId,
                cleanIp
            );

            return NextResponse.json({
                success: true,
                action: "PARDONED",
                ip: cleanIp
            });
        }

        return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    } catch (err: any) {
        console.error("Reputation POST error:", err);
        return NextResponse.json({ error: err.message || "Failed to execute SOC action." }, { status: 500 });
    }
}
