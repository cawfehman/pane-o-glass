import { NextRequest, NextResponse } from "next/server";
import { CiscoEtdService } from "@/lib/etd";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const rangeSeconds = parseInt(searchParams.get("rangeSeconds") || "86400", 10);

        const etdService = new CiscoEtdService();
        const data = await etdService.getRetrospectiveVerdicts(rangeSeconds);

        return NextResponse.json(data);
    } catch (e: any) {
        console.error("ETD Retrospective Route Error:", e?.message || e);
        return NextResponse.json(
            { error: "Failed to fetch ETD retrospective verdicts", details: e?.message },
            { status: 500 }
        );
    }
}
