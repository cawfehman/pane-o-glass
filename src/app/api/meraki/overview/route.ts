import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getMerakiFleetOverview, resolveMerakiDeviceByMacOrIp } from "@/lib/meraki";

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
        const forceRefresh = searchParams.get("refresh") === "true";
        const resolveQuery = searchParams.get("resolve");

        if (resolveQuery) {
            const match = await resolveMerakiDeviceByMacOrIp(resolveQuery);
            return NextResponse.json({ device: match });
        }

        const overview = await getMerakiFleetOverview({
            orgId,
            forceRefresh,
        });

        return NextResponse.json(overview);
    } catch (error: any) {
        console.error("[Meraki Overview API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to fetch Meraki fleet overview" },
            { status: 500 }
        );
    }
}
