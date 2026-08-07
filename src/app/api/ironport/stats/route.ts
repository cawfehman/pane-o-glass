import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { OgGraylogClient } from "@/lib/og-graylog";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ironport'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeParam = searchParams.get("range");
        const volumeQueryParam = searchParams.get("volumeQuery");

        const rangeSeconds = rangeParam ? parseInt(rangeParam, 10) : 86400;
        const volumeQuery = volumeQueryParam || 'message:"inbound table"';

        const client = new OgGraylogClient();

        const cutoffDate = new Date(Date.now() - rangeSeconds * 1000);

        // Check if database has hourly metrics cached
        const dbStats = await (prisma as any).ironportHourlyStat.findMany({
            where: {
                timestamp: { gte: cutoffDate }
            },
            orderBy: { timestamp: "asc" }
        });

        // If we have DB records and user requested standard inbound/outbound query, return from DB cache + fetch live categories!
        if (dbStats && dbStats.length >= 3 && (volumeQuery.includes("inbound") || volumeQuery.includes("outbound"))) {
            const isOutbound = volumeQuery.includes("outbound");
            
            let totalVolume = 0;
            let delayedMessages = 0;
            let urlRewrites = 0;
            let malwareAlerts = 0;

            const totalVolumeChart: any[] = [];
            const delayedMessagesChart: any[] = [];
            const urlRewritesChart: any[] = [];
            const malwareAlertsChart: any[] = [];

            dbStats.forEach((row: any) => {
                const ts = new Date(row.timestamp).getTime();
                const vol = isOutbound ? row.outboundVolume : row.inboundVolume;

                totalVolume += vol;
                delayedMessages += row.delayedCount;
                urlRewrites += row.phishingCount;
                malwareAlerts += row.malwareCount;

                totalVolumeChart.push({ timestamp: ts, count: vol });
                delayedMessagesChart.push({ timestamp: ts, count: row.delayedCount });
                urlRewritesChart.push({ timestamp: ts, count: row.phishingCount });
                malwareAlertsChart.push({ timestamp: ts, count: row.malwareCount });
            });

            // Fetch live whitelisted category histogram to populate the content trend graph seamlessly
            let whitelistedSeries: any[] = [];
            let whitelistedTotal = 0;

            try {
                const wHist = await client.getHistogram('message:"Whitelisted Addresses"', rangeSeconds);
                whitelistedSeries = wHist.series;
                whitelistedTotal = wHist.total;
            } catch (e) {
                // Fallback to empty series
            }

            const inboundCategories = [
                {
                    name: "Standard Inbound Policy",
                    value: Math.max(0, totalVolume - whitelistedTotal),
                    color: "#3b82f6",
                    query: 'message:"per-recipient policy DEFAULT"',
                    chart: totalVolumeChart
                },
                {
                    name: "Whitelisted Senders",
                    value: whitelistedTotal,
                    color: "#a855f7",
                    query: 'message:"Whitelisted Addresses"',
                    chart: whitelistedSeries
                }
            ];

            return NextResponse.json({
                rangeSeconds,
                volumeQuery,
                totalVolume,
                totalVolumeChart,
                delayedMessages,
                delayedMessagesChart,
                urlRewrites,
                urlRewritesChart,
                malwareAlerts,
                malwareAlertsChart,
                inboundCategories,
                fromCache: true
            });
        }

        // Live Graylog Fallback
        const stats = await client.getDashboardStats(rangeSeconds, volumeQuery);
        return NextResponse.json(stats);
    } catch (error: any) {
        console.error("IronPort Stats API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch IronPort stats from Graylog", details: error.message },
            { status: 500 }
        );
    }
}
