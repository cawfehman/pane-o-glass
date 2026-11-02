import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { enrichPendingShunIps } from "@/lib/shun-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "firewall", userId))) {
            return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const maxLimit = typeof body?.limit === "number" && body.limit > 0 ? body.limit : 200;

        const result = await enrichPendingShunIps(maxLimit);
        const remainingPending = await prisma.shunDatabaseIp.count({ where: { enrichedAt: null } });

        return NextResponse.json({
            success: true,
            enriched: result,
            remainingPending
        });
    } catch (error: any) {
        console.error("Shun Enrichment Queue Error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to process enrichment queue." },
            { status: 500 }
        );
    }
}
