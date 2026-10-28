import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { replicateShunToFleet, replicateBatchToFleet, getFleetShunCoverage } from "@/lib/universal-shun-sync";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "firewall", userId))) {
            return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
        }

        const url = new URL(req.url);
        const ip = url.searchParams.get("ip");

        if (ip) {
            const coverageMap = await getFleetShunCoverage([ip]);
            const cov = coverageMap.get(ip);
            return NextResponse.json({
                ip,
                coverage: cov || null
            });
        }

        return new NextResponse("Missing ?ip= parameter", { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "firewall", userId))) {
            return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
        }

        const body = await req.json();
        const { mode = "single", ip, ips, limit, reason } = body;

        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "dashboard";
        const opUserId = session.user.id || (session.user as any).username || "admin";

        if (mode === "single") {
            if (!ip) {
                return new NextResponse("Missing ip parameter for single mode", { status: 400 });
            }
            const result = await replicateShunToFleet(ip, {
                reason: reason || `Manual universal fleet shun replication requested by operator`,
                userId: opUserId,
                clientIp
            });
            return NextResponse.json(result);
        }

        if (mode === "list" || mode === "specific") {
            const list = Array.isArray(ips) ? ips : ip ? [ip] : [];
            if (list.length === 0) {
                return new NextResponse("Missing ips list parameter", { status: 400 });
            }
            const result = await replicateBatchToFleet({
                mode: "specific",
                ips: list,
                limit: limit || 100,
                userId,
                clientIp
            });
            return NextResponse.json(result);
        }

        if (mode === "blacklist") {
            const result = await replicateBatchToFleet({
                mode: "blacklist",
                limit: limit || 500,
                userId,
                clientIp
            });
            return NextResponse.json(result);
        }

        if (mode === "all_partial") {
            const result = await replicateBatchToFleet({
                mode: "all_partial",
                limit: limit || 500,
                userId,
                clientIp
            });
            return NextResponse.json(result);
        }

        return new NextResponse("Invalid mode. Must be 'single', 'list', 'blacklist', or 'all_partial'", { status: 400 });

    } catch (error: any) {
        console.error("Universalize API error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
