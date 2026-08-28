import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    const startTime = Date.now();
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'vpn-reporting'))) {
            return new NextResponse("Forbidden: Access restricted to authorized VPN Reporting roles.", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("query")?.trim() || "";
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 86400; // 24h default
        const startDateParam = searchParams.get("startDate");
        const endDateParam = searchParams.get("endDate");
        const statusParam = searchParams.get("status")?.toUpperCase() || "ALL";
        const limitParam = parseInt(searchParams.get("limit") || "2000", 10);
        const limit = isNaN(limitParam) ? 2000 : Math.min(10000, Math.max(1, limitParam));

        const whereConditions: any = {};

        // 1. Timeframe filtering: Custom Date Range vs. Relative Range
        if (startDateParam || endDateParam) {
            whereConditions.createdAt = {};
            if (startDateParam) whereConditions.createdAt.gte = new Date(startDateParam);
            if (endDateParam) whereConditions.createdAt.lte = new Date(endDateParam);
        } else if (rangeSeconds > 0) {
            whereConditions.createdAt = { gte: new Date(Date.now() - rangeSeconds * 1000) };
        }

        // 2. Status event type filtering
        if (statusParam && statusParam !== "ALL") {
            whereConditions.status = statusParam;
        }

        // 3. Username / IP / Reason multi-field search
        if (query) {
            whereConditions.OR = [
                { username: { contains: query, mode: 'insensitive' } },
                { sourceIp: { contains: query } },
                { assignedIp: { contains: query } },
                { failureReason: { contains: query, mode: 'insensitive' } },
                { vpnStream: { contains: query, mode: 'insensitive' } },
                { ipAsName: { contains: query, mode: 'insensitive' } }
            ];
        }

        // 4. Query PostgreSQL database
        const events = await prisma.vpnEvent.findMany({
            where: whereConditions,
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        // 5. Calculate summary metrics
        const uniqueUserSet = new Set<string>();
        const uniqueIpSet = new Set<string>();
        let successCount = 0;
        let failureCount = 0;
        let disconnectCount = 0;
        let totalBytes = 0;

        for (const evt of events) {
            if (evt.username) uniqueUserSet.add(evt.username.toLowerCase());
            if (evt.sourceIp) uniqueIpSet.add(evt.sourceIp);
            if (evt.status === "SUCCESS") successCount++;
            else if (evt.status === "FAILURE") failureCount++;
            else if (evt.status === "DISCONNECT") disconnectCount++;

            if (evt.bytesTotal) totalBytes += evt.bytesTotal;
        }

        const responseTimeMs = Date.now() - startTime;

        return NextResponse.json({
            responseTimeMs,
            totalEvents: events.length,
            uniqueUsersCount: uniqueUserSet.size,
            uniqueIpsCount: uniqueIpSet.size,
            successCount,
            failureCount,
            disconnectCount,
            totalBytesTransferred: totalBytes,
            events
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            }
        });

    } catch (error: any) {
        console.error("VPN Reporting API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch VPN reporting data", details: error.message },
            { status: 500 }
        );
    }
}
