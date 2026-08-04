import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const url = new URL(req.url);
        const ip = url.searchParams.get("ip");
        if (!ip) return new NextResponse("Missing IP", { status: 400 });

        const cached = await prisma.ipLookupCache.findUnique({
            where: { ip }
        });

        if (!cached || !cached.rawJson) {
            return new NextResponse("Raw enrichment data not found for this IP.", { status: 404 });
        }

        return new NextResponse(cached.rawJson, {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("Raw Lookup Fetch Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
