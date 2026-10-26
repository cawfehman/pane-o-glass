import { enqueueFirewallCommand, getDynamicHoldExpiresAt } from "@/lib/firewall-queue";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { isPrivateIp } from "@/lib/ipinfo";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const [hasFw, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall"),
        hasPermission(role, "netscaler")
    ]);
    return Boolean(hasFw || hasNetscaler);
}

// POST: Add an IP or CIDR block to the Security Intelligence Feed ad-hoc
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { target, reason } = body;

        if (!target || typeof target !== "string" || !reason) {
            return NextResponse.json({ error: "Target (IPv4 or CIDR) and reason are required." }, { status: 400 });
        }

        const cleanTarget = target.trim();
        const cleanReason = reason.trim();

        // Validate IPv4 single address or CIDR
        const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
        const cidrRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/(?:[1-2]?[0-9]|3[0-2])$/;

        if (!ipv4Regex.test(cleanTarget) && !cidrRegex.test(cleanTarget)) {
            return NextResponse.json({ error: "Invalid target format. Must be an IPv4 address (e.g. 198.51.100.4) or CIDR (e.g. 198.51.100.0/24)." }, { status: 400 });
        }

        const baseIp = cleanTarget.split("/")[0];
        if (isPrivateIp(baseIp)) {
            return NextResponse.json({ error: "Cannot block private RFC 1918 / internal IP spaces." }, { status: 400 });
        }

        // Upsert into GuardianBlacklist (which feeds directly into the SI feed)
        const entry = await prisma.guardianBlacklist.upsert({
            where: { ip: cleanTarget },
            update: { reason: cleanReason },
            create: { ip: cleanTarget, reason: cleanReason }
        });

        const applyTempShun = body.applyTempShun !== false;
        if (applyTempShun && !cleanTarget.includes("/")) {
            const dynamicHold = await getDynamicHoldExpiresAt();
            await enqueueFirewallCommand({
                ip: cleanTarget,
                action: "SHUN",
                reason: cleanReason,
                expiresAt: dynamicHold
            });
        }

        const userId = (session.user as any)?.id || "admin";
        await logAudit(
            "SI_FEED_ADHOC_ADD",
            `Ad-hoc Security Intelligence block added for ${cleanTarget}. Reason: ${cleanReason}`,
            userId,
            cleanTarget
        );

        return NextResponse.json({
            success: true,
            action: "ADDED_TO_SI_FEED",
            target: cleanTarget,
            reason: cleanReason,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error("Ad-hoc SI Feed Add Error:", err);
        return NextResponse.json({ error: err.message || "Failed to add entry to SI feed." }, { status: 500 });
    }
}

// DELETE: Remove an IP or CIDR block from the Security Intelligence Feed ad-hoc
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const target = url.searchParams.get("target")?.trim();

        if (!target) {
            return NextResponse.json({ error: "Target parameter is required." }, { status: 400 });
        }

        // Delete from GuardianBlacklist
        await prisma.guardianBlacklist.deleteMany({
            where: { ip: target }
        });

        // Also deactivate in ShunDatabase if present
        await prisma.firewallShunStats.updateMany({
            where: { ip: target },
            data: { isActive: false }
        });

        // Enqueue UNSHUN on firewalls
        await enqueueFirewallCommand({
            ip: target,
            action: "UNSHUN",
            reason: "Ad-hoc SI feed removal"
        });

        const userId = (session.user as any)?.id || "admin";
        await logAudit(
            "SI_FEED_ADHOC_REMOVE",
            `Ad-hoc Security Intelligence entry removed for ${target}.`,
            userId,
            target
        );

        return NextResponse.json({
            success: true,
            action: "REMOVED_FROM_SI_FEED",
            target,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error("Ad-hoc SI Feed Remove Error:", err);
        return NextResponse.json({ error: err.message || "Failed to remove entry from SI feed." }, { status: 500 });
    }
}
