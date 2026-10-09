import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pingHost } from "@/lib/vpn-ping-service";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const target = (body.target || "").trim();
        const label = (body.label || target).trim();
        const type = body.type || "ra_client";

        if (!target) {
            return NextResponse.json({ error: "Target IP or hostname is required" }, { status: 400 });
        }

        // Validate basic IPv4 / hostname syntax for safety
        if (!/^[a-zA-Z0-9\.\-_]+$/.test(target)) {
            return NextResponse.json({ error: "Invalid target characters" }, { status: 400 });
        }

        const gatewayId = body.gatewayId ? String(body.gatewayId).trim() : undefined;

        const sample = await pingHost(target, label, type, 3, 1200, gatewayId);

        return NextResponse.json({
            success: true,
            sample
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Ping failed" }, { status: 500 });
    }
}
