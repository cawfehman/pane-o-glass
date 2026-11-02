import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIpLocateCreditStatus } from "@/lib/iplocate-credits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get("refresh") === "true";

        const [info, pendingQueueCount, totalShunCount] = await Promise.all([
            getIpLocateCreditStatus(forceRefresh),
            prisma.shunDatabaseIp.count({ where: { enrichedAt: null } }).catch(() => 0),
            prisma.shunDatabaseIp.count().catch(() => 0)
        ]);

        return NextResponse.json({
            ...info,
            queueBacklog: {
                pending: pendingQueueCount,
                total: totalShunCount
            }
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const [info, pendingQueueCount, totalShunCount] = await Promise.all([
            getIpLocateCreditStatus(true),
            prisma.shunDatabaseIp.count({ where: { enrichedAt: null } }).catch(() => 0),
            prisma.shunDatabaseIp.count().catch(() => 0)
        ]);

        return NextResponse.json({
            ...info,
            queueBacklog: {
                pending: pendingQueueCount,
                total: totalShunCount
            }
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
