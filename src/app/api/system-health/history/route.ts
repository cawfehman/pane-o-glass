import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHistoricalTelemetry } from "@/lib/sqliteTelemetry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const timeframeParam = searchParams.get("timeframe") || "24h";

        let hours = 24;
        if (timeframeParam === "1h") hours = 1;
        else if (timeframeParam === "6h") hours = 6;
        else if (timeframeParam === "12h") hours = 12;
        else if (timeframeParam === "24h") hours = 24;
        else if (timeframeParam === "7d") hours = 168;
        else if (timeframeParam === "14d") hours = 336;

        const data = await getHistoricalTelemetry(hours);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Health History API Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
