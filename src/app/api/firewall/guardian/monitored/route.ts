import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export const dynamic = "force-dynamic";

let lastMonitoredEnvMtimeMs = 0;

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// GET /api/firewall/guardian/monitored
// Returns all monitored watch IPs. Automatically synchronizes any newly added IPs from .env into PostgreSQL.
export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, 'firewall', userId))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        // 1. Sync .env from disk only when modified (avoids per-request disk/DB overhead and preserves UI deletions)
        try {
            const envPath = path.resolve(process.cwd(), ".env");
            if (fs.existsSync(envPath)) {
                const stat = fs.statSync(envPath);
                if (stat.mtimeMs !== lastMonitoredEnvMtimeMs) {
                    const envConfig = dotenv.parse(fs.readFileSync(envPath, "utf8"));
                    const getVal = (key: string): string => envConfig[key] || process.env[key] || "";

                    const rawWatchList = [
                        getVal("WATCH_IP_LIST"),
                        getVal("GUARDIAN_WATCH_IP_LIST"),
                        getVal("GUARDIAN_WATCH_LIST"),
                        getVal("GUARDIAN_IPS")
                    ].join(",");

                    const envIps = Array.from(new Set(
                        rawWatchList
                            .split(",")
                            .map(ip => ip.trim())
                            .filter(ip => IPV4_REGEX.test(ip))
                    ));

                    if (envIps.length > 0) {
                        await prisma.guardianWatchIp.createMany({
                            data: envIps.map(ip => ({
                                ip,
                                description: "Synced from WATCH_IP_LIST (.env)",
                                createdBy: "System (.env Sync)"
                            })),
                            skipDuplicates: true
                        }).catch(() => {});
                    }

                    const rawBlacklist = [
                        getVal("GUARDIAN_BLACKLIST"),
                        getVal("GUARDIAN_BLACKLIST_IPS"),
                        getVal("BLACKLIST_IP_LIST")
                    ].join(",");

                    const blacklistIps = Array.from(new Set(
                        rawBlacklist
                            .split(",")
                            .map(ip => ip.trim())
                            .filter(ip => IPV4_REGEX.test(ip))
                    ));

                    if (blacklistIps.length > 0) {
                        await prisma.guardianBlacklist.createMany({
                            data: blacklistIps.map(ip => ({
                                ip,
                                reason: "Synced from GUARDIAN_BLACKLIST (.env)"
                            })),
                            skipDuplicates: true
                        }).catch(() => {});
                    }

                    lastMonitoredEnvMtimeMs = stat.mtimeMs;
                }
            }
        } catch (e) {}

        const items = await prisma.guardianWatchIp.findMany({
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json({ success: true, items });
    } catch (err: any) {
        console.error("Failed to load Guardian monitored IPs:", err);
        return NextResponse.json({ error: err.message || "Failed to load monitored IPs" }, { status: 500 });
    }
}

// POST /api/firewall/guardian/monitored
// Adds or updates a monitored IP on the Guardian Watchlist
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, 'firewall', userId))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { ip, description } = body;

        const cleanIp = String(ip || "").trim();
        const cleanDesc = String(description || "").trim();

        if (!cleanIp || !IPV4_REGEX.test(cleanIp)) {
            return NextResponse.json({ error: "A valid IPv4 address is required." }, { status: 400 });
        }

        const authorName = (session.user as any).username || session.user.name || session.user.email || "Admin";
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'internal';

        const entry = await prisma.guardianWatchIp.upsert({
            where: { ip: cleanIp },
            update: {
                description: cleanDesc || "Monitored watch IP",
                createdBy: authorName
            },
            create: {
                ip: cleanIp,
                description: cleanDesc || "Monitored watch IP",
                createdBy: authorName
            }
        });

        // Dual-audit: System AuditLog + Operations History
        await logAudit(
            "GUARDIAN_MONITORED_IP_ADD",
            `Added ${cleanIp} to Guardian monitored watchlist - Reason: "${cleanDesc || 'No description provided'}"`,
            session.user.id,
            clientIp
        ).catch(() => {});

        await prisma.firewallQueryHistory.create({
            data: {
                userId: session.user.id,
                command: "Add Monitored IP (Guardian)",
                targetIp: cleanIp,
                targetName: "Guardian Watchlist"
            }
        }).catch(() => {});

        return NextResponse.json({ success: true, entry });
    } catch (err: any) {
        console.error("Failed to add monitored IP:", err);
        return NextResponse.json({ error: err.message || "Failed to add monitored IP" }, { status: 500 });
    }
}

// DELETE /api/firewall/guardian/monitored?ip=...
// Removes an IP from the Guardian Watchlist
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, 'firewall', userId))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const ip = searchParams.get("ip")?.trim();

        if (!ip) {
            return NextResponse.json({ error: "Missing ip parameter." }, { status: 400 });
        }

        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'internal';

        await prisma.guardianWatchIp.delete({
            where: { ip }
        }).catch(() => {});

        // Dual-audit: System AuditLog + Operations History
        await logAudit(
            "GUARDIAN_MONITORED_IP_REMOVE",
            `Removed ${ip} from Guardian monitored watchlist`,
            session.user?.id,
            clientIp
        ).catch(() => {});

        await prisma.firewallQueryHistory.create({
            data: {
                userId: session.user?.id,
                command: "Remove Monitored IP (Guardian)",
                targetIp: ip,
                targetName: "Guardian Watchlist"
            }
        }).catch(() => {});

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Failed to delete monitored IP:", err);
        return NextResponse.json({ error: err.message || "Failed to delete monitored IP" }, { status: 500 });
    }
}
