import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { runSubnetCondensation } from "@/lib/subnet-condenser";
import { invalidateFeedCache } from "@/app/api/feeds/security-intelligence/route";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const userId = session.user.id;
    const [hasFw, hasNetscaler, hasVpn] = await Promise.all([
        hasPermission(role, "firewall", userId),
        hasPermission(role, "netscaler", userId),
        hasPermission(role, "vpn-reporting", userId)
    ]);
    return Boolean(hasFw || hasNetscaler || hasVpn);
}

// GET: Returns Dry-Run preview of candidate subnets for condensation
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Access restricted to Security Administrators." }, { status: 403 });
        }

        const url = new URL(req.url);
        const targetAsn = url.searchParams.get("asn") || undefined;
        const minAttackers = parseInt(url.searchParams.get("minAttackers") || "2", 10);

        const result = await runSubnetCondensation({
            dryRun: true,
            minAttackersPerSubnet: isNaN(minAttackers) ? 2 : minAttackers,
            targetAsn
        });

        return NextResponse.json(result);
    } catch (err: any) {
        console.error("Subnet Condensation Preview Error:", err);
        return NextResponse.json({ error: err.message || "Failed to preview subnet condensation" }, { status: 500 });
    }
}

// POST: Executes subnet condensation (dryRun: false will write to GuardianBlacklist)
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Access restricted to Security Administrators." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { dryRun = true, minAttackersPerSubnet = 2, targetAsn } = body;

        const result = await runSubnetCondensation({
            dryRun: Boolean(dryRun),
            minAttackersPerSubnet: Number(minAttackersPerSubnet) || 2,
            targetAsn: targetAsn ? String(targetAsn).trim() : undefined
        });

        if (!dryRun && result.condensedSubnetsCount > 0) {
            const author = (session.user as any)?.username || session.user?.name || session.user?.email || "Admin";
            const forwardedFor = req.headers.get("x-forwarded-for");
            const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'internal';

            await logAudit(
                "GUARDIAN_SUBNET_CONDENSATION",
                `Condensed ${result.redundantIpsSubsumed} attack IPs into ${result.condensedSubnetsCount} /24-/22 subnets: ${result.appliedSubnets?.slice(0, 10).join(", ")}`,
                session.user.id,
                clientIp
            ).catch(() => {});

            invalidateFeedCache();
        }

        return NextResponse.json({
            success: true,
            ...result
        });
    } catch (err: any) {
        console.error("Subnet Condensation Execution Error:", err);
        return NextResponse.json({ error: err.message || "Failed to execute subnet condensation" }, { status: 500 });
    }
}
