import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import {
    analyzeCitrixLoginTriage,
    reevaluateSingleCitrixIp,
    blockCitrixAbusiveIps,
    updateCitrixAutoShunConfig,
    runCitrixLoginAutoShunCycle,
    DEFAULT_CITRIX_TRIAGE_CONFIG,
    CitrixTriageConfig,
} from "@/lib/netscaler-login-triage";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "netscaler"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeSeconds = parseInt(searchParams.get("range") || "86400", 10) || 86400;

        const customConfig: Partial<CitrixTriageConfig> = {
            minFailuresForBlock: searchParams.has("minFailures")
                ? Math.max(1, parseInt(searchParams.get("minFailures")!, 10) || 3)
                : DEFAULT_CITRIX_TRIAGE_CONFIG.minFailuresForBlock,
            minSprayUsers: searchParams.has("minSprayUsers")
                ? Math.max(2, parseInt(searchParams.get("minSprayUsers")!, 10) || 2)
                : DEFAULT_CITRIX_TRIAGE_CONFIG.minSprayUsers,
            flagForeignIps: searchParams.has("flagForeignIps")
                ? searchParams.get("flagForeignIps") !== "false"
                : DEFAULT_CITRIX_TRIAGE_CONFIG.flagForeignIps,
            flagNonExistentAdUsers: searchParams.has("flagNonExistentAdUsers")
                ? searchParams.get("flagNonExistentAdUsers") !== "false"
                : DEFAULT_CITRIX_TRIAGE_CONFIG.flagNonExistentAdUsers,
            protectIspWithValidAdUser: searchParams.has("protectIspWithValidAdUser")
                ? searchParams.get("protectIspWithValidAdUser") !== "false"
                : DEFAULT_CITRIX_TRIAGE_CONFIG.protectIspWithValidAdUser,
        };

        if (searchParams.has("targetIp")) {
            const targetIp = searchParams.get("targetIp")!;
            const result = await reevaluateSingleCitrixIp(targetIp, rangeSeconds, customConfig);
            return NextResponse.json({ success: true, ...result });
        }

        const data = await analyzeCitrixLoginTriage(rangeSeconds, customConfig);
        return NextResponse.json({ success: true, ...data });
    } catch (error: any) {
        console.error("[NetScaler Login Triage API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to analyze Citrix login triage telemetry", details: error.message },
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
        const {
            action,
            ips = [],
            ip,
            reason = "Citrix Login Abuse Detection",
            targetHost = "all",
            addToGuardianBlacklist = true,
        } = body;

        const userId = session.user.id || "unknown";
        const username = (session.user as any)?.username || session.user.name || userId;
        const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

        if (action === "update_auto_shun_config") {
            const updated = await updateCitrixAutoShunConfig(
                {
                    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
                    ...(typeof body.windowSeconds === "number" ? { windowSeconds: Math.max(60, body.windowSeconds) } : {}),
                    ...(typeof body.minAuthFailuresIn10m === "number"
                        ? { minAuthFailuresIn10m: Math.max(1, body.minAuthFailuresIn10m) }
                        : {}),
                    ...(typeof body.shunSingleFailureOnBlacklistedAsn === "boolean"
                        ? { shunSingleFailureOnBlacklistedAsn: body.shunSingleFailureOnBlacklistedAsn }
                        : {}),
                    ...(typeof body.targetHost === "string" ? { targetHost: body.targetHost } : {}),
                },
                username
            );
            return NextResponse.json({ success: true, autoShunConfig: updated });
        }

        if (action === "run_auto_shun_cycle") {
            const cycleResult = await runCitrixLoginAutoShunCycle({
                forceRun: true,
                triggeredBy: userId,
            });
            return NextResponse.json({ success: true, cycleResult });
        }

        if (action === "reevaluate_ip") {
            const target = ip || (Array.isArray(ips) && ips.length > 0 ? ips[0] : null);
            if (!target) {
                return NextResponse.json({ error: "Missing target IP address" }, { status: 400 });
            }
            const rangeSeconds = typeof body.rangeSeconds === "number" ? body.rangeSeconds : 86400;
            const result = await reevaluateSingleCitrixIp(target, rangeSeconds, body.config);
            return NextResponse.json({ success: true, ...result });
        }

        if (action === "blacklist_asn") {
            const rawAsn = String(body.asn || "").trim();
            if (!rawAsn) return NextResponse.json({ error: "Missing ASN" }, { status: 400 });
            const cleanAsnNum = rawAsn.toUpperCase().replace(/^AS/, "");
            const asnKey = `AS${cleanAsnNum}`;
            const asnReason = body.reason || `Blacklisted via Citrix Abuse Triage: zero-tolerance 1-failure autoshun rule`;
            const asnName = body.asnName || body.companyName || null;

            const entry = await prisma.guardianAsnBlacklist.upsert({
                where: { asn: asnKey },
                update: {
                    reason: asnReason,
                    asnName,
                    createdBy: username
                },
                create: {
                    asn: asnKey,
                    asnName,
                    reason: asnReason,
                    createdBy: username
                }
            });

            await logAudit(
                "GUARDIAN_ASN_BLACKLIST_ADD",
                `Blacklisted ASN ${asnKey} (${asnName || 'Unknown'}) via Citrix Abuse Triage (1-failure autoshun rule) - Reason: "${asnReason}"`,
                userId,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true, entry });
        }

        if (action === "remove_asn_blacklist") {
            const rawAsn = String(body.asn || "").trim();
            if (!rawAsn) return NextResponse.json({ error: "Missing ASN" }, { status: 400 });
            const cleanAsnNum = rawAsn.toUpperCase().replace(/^AS/, "");
            const asnKey = `AS${cleanAsnNum}`;

            await prisma.guardianAsnBlacklist.delete({ where: { asn: asnKey } }).catch(() => {});
            await prisma.guardianAsnBlacklist.delete({ where: { asn: cleanAsnNum } }).catch(() => {});

            await logAudit(
                "GUARDIAN_ASN_BLACKLIST_CLEAR",
                `Removed ASN ${asnKey} from Guardian blacklist via Citrix Abuse Triage`,
                userId,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true, removedAsn: asnKey });
        }

        const targetIps: string[] = Array.isArray(ips) && ips.length > 0 ? ips : ip ? [ip] : [];
        if (targetIps.length === 0) {
            return NextResponse.json({ error: "No target IP addresses provided" }, { status: 400 });
        }

        if (action === "block_ips") {
            const result = await blockCitrixAbusiveIps({
                ips: targetIps,
                reason,
                targetHost,
                addToGuardianBlacklist,
                userId,
                clientIp,
                initiatorEmail: session.user.email || username || userId,
            });
            return NextResponse.json(result);
        }

        if (action === "add_guardian_blacklist") {
            for (const targetIp of targetIps) {
                const clean = String(targetIp).trim();
                await prisma.guardianBlacklist.upsert({
                    where: { ip: clean },
                    update: { reason: `[Citrix Abuse Guard] ${reason}` },
                    create: { ip: clean, reason: `[Citrix Abuse Guard] ${reason}` },
                });
            }
            await logAudit(
                "GUARDIAN_BLACKLIST_ADD",
                `Added ${targetIps.join(", ")} to Guardian Do-Not-Unshun Blacklist from Citrix Triage. Reason: ${reason}`,
                userId,
                clientIp
            );
            return NextResponse.json({ success: true, count: targetIps.length });
        }

        if (action === "remove_guardian_blacklist") {
            await prisma.guardianBlacklist.deleteMany({
                where: { ip: { in: targetIps.map((i) => String(i).trim()) } },
            });
            await logAudit(
                "GUARDIAN_BLACKLIST_REMOVE",
                `Removed ${targetIps.join(", ")} from Guardian Do-Not-Unshun Blacklist via Citrix Triage`,
                userId,
                clientIp
            );
            return NextResponse.json({ success: true, count: targetIps.length });
        }

        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    } catch (error: any) {
        console.error("[NetScaler Login Triage API] POST error:", error);
        return NextResponse.json(
            { error: "Failed to execute Citrix login triage action", details: error.message },
            { status: 500 }
        );
    }
}
