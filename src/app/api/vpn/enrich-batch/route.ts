import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enrichIpsBatch } from "@/lib/iplocate";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify Analyst/Admin permissions (desktop role is excluded)
        const role = (session.user as any).role || "USER";
        const normalizedRole = String(role).toUpperCase();
        if (normalizedRole === "DESKTOP") {
            return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });
        }

        const body = await req.json();
        const { ips } = body;

        if (!ips || !Array.isArray(ips)) {
            return NextResponse.json({ error: "Parameter 'ips' must be an array" }, { status: 400 });
        }

        const enriched = await enrichIpsBatch(ips, true); // true = ad-hoc analyst trigger
        
        return NextResponse.json({
            success: true,
            enriched
        });

    } catch (error: any) {
        console.error("Batch Enrichment Route Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message || "Internal server error" 
        }, { status: 500 });
    }
}
