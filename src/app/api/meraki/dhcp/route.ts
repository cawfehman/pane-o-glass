import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getMerakiDhcpPools } from "@/lib/meraki";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any)?.role || "USER";
        const allowed = await hasPermission(role, "meraki", session.user.id);
        if (!allowed) {
            return NextResponse.json({ error: "Forbidden: Meraki tool permission required" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const orgId = searchParams.get("orgId") || "ALL";
        const search = searchParams.get("search") || "";
        const serial = searchParams.get("serial") || "";
        const batchSize = parseInt(searchParams.get("batchSize") || "30", 10);
        const forceRefresh = searchParams.get("refresh") === "true";

        const result = await getMerakiDhcpPools({
            orgId,
            search,
            serial,
            batchSize: isNaN(batchSize) ? 30 : batchSize,
            forceRefresh,
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[Meraki DHCP API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to fetch Meraki DHCP pool utilization" },
            { status: 500 }
        );
    }
}
