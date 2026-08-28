import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET: Retrieves both IP and ASN blacklists
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const [ips, asns] = await Promise.all([
            prisma.guardianBlacklist.findMany({ orderBy: { createdAt: "desc" } }),
            prisma.guardianAsnBlacklist.findMany({ orderBy: { createdAt: "desc" } })
        ]);

        return NextResponse.json({ ips, asns });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to load Guardian blacklist" }, { status: 500 });
    }
}

// POST: Adds an IP or ASN to the Guardian Blacklist
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { type, target, reason, asnName } = body;

        if (!target || !reason) {
            return NextResponse.json({ error: "Target (IP or ASN) and reason are required." }, { status: 400 });
        }

        const cleanTarget = String(target).trim();
        const cleanReason = String(reason).trim();
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'internal';

        if (type === "ASN" || cleanTarget.toUpperCase().startsWith("AS") || /^\d+$/.test(cleanTarget)) {
            // Clean ASN string: e.g. "16509" or "AS16509" -> store as "16509"
            const rawAsnNumber = cleanTarget.toUpperCase().replace(/^AS/, "");
            const asnKey = `AS${rawAsnNumber}`;

            const entry = await prisma.guardianAsnBlacklist.upsert({
                where: { asn: asnKey },
                update: {
                    reason: cleanReason,
                    asnName: asnName || null,
                    createdBy: session.user.id || (session.user as any).username || "Admin"
                },
                create: {
                    asn: asnKey,
                    asnName: asnName || null,
                    reason: cleanReason,
                    createdBy: session.user.id || (session.user as any).username || "Admin"
                }
            });

            await logAudit(
                "GUARDIAN_ASN_BLACKLIST_ADD",
                `Blacklisted ASN ${asnKey} (${asnName || 'Unknown Org'}) - Reason: "${cleanReason}"`,
                session.user.id,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true, type: "ASN", entry });
        } else {
            // Treat as IP address
            const entry = await prisma.guardianBlacklist.upsert({
                where: { ip: cleanTarget },
                update: { reason: cleanReason },
                create: { ip: cleanTarget, reason: cleanReason }
            });

            await logAudit(
                "GUARDIAN_IP_BLACKLIST_ADD",
                `Blacklisted IP ${cleanTarget} - Reason: "${cleanReason}"`,
                session.user.id,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true, type: "IP", entry });
        }
    } catch (err: any) {
        console.error("Guardian Blacklist Add Error:", err);
        return NextResponse.json({ error: err.message || "Failed to add to blacklist" }, { status: 500 });
    }
}

// DELETE: Clears an IP or ASN from the Blacklist
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const ip = searchParams.get("ip")?.trim();
        const asn = searchParams.get("asn")?.trim();
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'internal';

        if (asn) {
            const rawAsnNumber = asn.toUpperCase().replace(/^AS/, "");
            const asnKey = `AS${rawAsnNumber}`;

            await prisma.guardianAsnBlacklist.delete({ where: { asn: asnKey } }).catch(() => {});
            await prisma.guardianAsnBlacklist.delete({ where: { asn: rawAsnNumber } }).catch(() => {});

            await logAudit(
                "GUARDIAN_ASN_BLACKLIST_CLEAR",
                `Manually removed ASN ${asnKey} from Guardian blacklist`,
                session.user?.id,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true });
        }

        if (ip) {
            await prisma.guardianBlacklist.delete({
                where: { ip }
            });

            await logAudit(
                "GUARDIAN_IP_BLACKLIST_CLEAR",
                `Manually removed IP ${ip} from Guardian do-not-unshun blacklist`,
                session.user?.id,
                clientIp
            ).catch(() => {});

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Missing ip or asn parameter" }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to clear item from blacklist" }, { status: 500 });
    }
}
