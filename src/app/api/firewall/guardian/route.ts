import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search")?.trim() || "";
        const action = searchParams.get("action")?.trim() || "";

        const whereClause: any = {};

        if (action) {
            whereClause.action = action;
        }

        if (search) {
            whereClause.OR = [
                { ip: { contains: search } },
                { companyName: { contains: search } },
                { companyType: { contains: search } },
                { cidr: { contains: search } },
                { asn: { contains: search } },
                { details: { contains: search } }
            ];
        }

        const events = await prisma.guardianEvent.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            take: 200 // Cap results to keep response quick
        });

        return NextResponse.json(events);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to load Guardian events" }, { status: 500 });
    }
}
