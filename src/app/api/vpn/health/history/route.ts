import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHealthHistory, startPingMonitorDaemon } from "@/lib/vpn-ping-service";

// Ensure background prober is active
startPingMonitorDaemon();

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const target = searchParams.get("target") || undefined;
        const type = (searchParams.get("type") as any) || undefined;
        const hours = parseInt(searchParams.get("hours") || "24", 10);

        const history = getHealthHistory(target, type, hours);

        // Group by target to provide convenient time-series format for Recharts
        const groupedByTarget: Record<string, any[]> = {};
        for (const s of history) {
            if (!groupedByTarget[s.target]) {
                groupedByTarget[s.target] = [];
            }
            groupedByTarget[s.target].push({
                time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: s.timestamp,
                rttAvg: s.rttAvg,
                rttMin: s.rttMin,
                rttMax: s.rttMax,
                packetLoss: s.packetLoss,
                label: s.label
            });
        }

        return NextResponse.json({
            success: true,
            samplesCount: history.length,
            history,
            grouped: groupedByTarget
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to fetch health history" }, { status: 500 });
    }
}
