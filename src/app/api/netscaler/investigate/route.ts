import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { NetscalerGraylogClient } from "@/lib/netscaler-graylog";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'netscaler'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const body = await req.json();
        const { query, range = 86400, limit = 150 } = body;

        if (!query || typeof query !== "string") {
            return new NextResponse("Missing query string", { status: 400 });
        }

        const client = new NetscalerGraylogClient();
        const timeline = await client.investigate(query, range, limit);

        // Audit log search
        const clientIp = req.headers.get("x-forwarded-for") || "127.0.0.1";
        const userId = session?.user?.id || "unknown";
        await logAudit(
            "NETSCALER_INVESTIGATE",
            `NetScaler investigation search for "${query}" (range: ${range}s, results: ${timeline.length})`,
            userId,
            clientIp
        );

        return NextResponse.json({ timeline });
    } catch (error: any) {
        console.error("NetScaler Investigate API Error:", error);
        return NextResponse.json(
            { error: "Failed to investigate NetScaler query", details: error.message },
            { status: 500 }
        );
    }
}
