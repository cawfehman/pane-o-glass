import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN audits is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const peerIp = searchParams.get("peerIp")?.trim() || "";
        const tunnelId = searchParams.get("tunnelId")?.trim() || "";
        const tunnelName = searchParams.get("tunnelName")?.trim() || "";

        if (!peerIp && !tunnelId && !tunnelName) {
            return NextResponse.json({ success: true, audits: [] });
        }

        const orConditions: any[] = [];
        if (peerIp) {
            orConditions.push({ details: { contains: peerIp, mode: "insensitive" } });
        }
        if (tunnelName) {
            orConditions.push({ details: { contains: tunnelName, mode: "insensitive" } });
        }
        if (tunnelId) {
            orConditions.push({ details: { contains: tunnelId, mode: "insensitive" } });
        }

        const audits = await prisma.auditLog.findMany({
            where: {
                action: { startsWith: "VPN_S2S_" },
                OR: orConditions
            },
            include: {
                user: {
                    select: {
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            },
            take: 100
        });

        return NextResponse.json({
            success: true,
            audits: audits.map(a => ({
                id: a.id,
                action: a.action,
                details: a.details,
                ipAddress: a.ipAddress,
                createdAt: a.createdAt.toISOString(),
                user: a.user ? {
                    username: a.user.username,
                    fullName: [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.username
                } : null
            }))
        });
    } catch (error: any) {
        console.error("Error fetching S2S audits:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch S2S audits" }, { status: 500 });
    }
}
