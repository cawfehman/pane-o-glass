import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getMerakiClientsAndWireless } from "@/lib/meraki";

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
        const networkId = searchParams.get("networkId") || "AUTO";
        const search = searchParams.get("search") || "";
        const timespan = parseInt(searchParams.get("timespan") || "86400", 10);
        const forceRefresh = searchParams.get("refresh") === "true";

        const data = await getMerakiClientsAndWireless({
            orgId,
            networkId,
            search,
            timespan: isNaN(timespan) ? 86400 : timespan,
            forceRefresh,
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[Meraki Wireless & Clients API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to fetch Meraki wireless & client telemetry" },
            { status: 500 }
        );
    }
}
