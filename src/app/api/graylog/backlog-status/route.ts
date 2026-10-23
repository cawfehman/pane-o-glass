import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGraylogBacklogTelemetry } from "@/lib/graylog-backlog-guardian";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const forceRefresh = searchParams.get("refresh") === "true";

        const report = await getGraylogBacklogTelemetry(forceRefresh);
        return NextResponse.json(report);
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to fetch Graylog backlog telemetry", details: error.message },
            { status: 500 }
        );
    }
}
