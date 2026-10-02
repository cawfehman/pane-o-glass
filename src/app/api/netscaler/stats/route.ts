import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { NetscalerGraylogClient } from "@/lib/netscaler-graylog";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'netscaler'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam ? parseInt(rangeParam, 10) : 86400;

        const client = new NetscalerGraylogClient();
        const stats = await client.getOverviewStats(rangeSeconds);

        return NextResponse.json(stats);
    } catch (error: any) {
        console.error("NetScaler Stats API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch NetScaler telemetry from Graylog", details: error.message },
            { status: 500 }
        );
    }
}
