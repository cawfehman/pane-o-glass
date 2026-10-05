import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { planExportSlices } from "@/lib/graylog-exporter";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { cluster, query, from, to, streamId } = body;

        if (!cluster || !from || !to) {
            return NextResponse.json(
                { error: "Missing required parameters: cluster, from, to are required." },
                { status: 400 }
            );
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json(
                { error: "Invalid date format for 'from' or 'to'." },
                { status: 400 }
            );
        }

        if (fromDate >= toDate) {
            return NextResponse.json(
                { error: "Start time must be before end time." },
                { status: 400 }
            );
        }

        const plan = await planExportSlices({
            cluster,
            query: query || "*",
            from: fromDate,
            to: toDate,
            streamId: streamId && streamId !== "all" ? streamId : undefined,
        });

        return NextResponse.json({ plan });
    } catch (err: any) {
        console.error("Export preflight planning error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to generate export plan" },
            { status: 500 }
        );
    }
}
