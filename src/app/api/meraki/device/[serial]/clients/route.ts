import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getMerakiDeviceClients } from "@/lib/meraki";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ serial: string }> }
) {
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

        const { serial } = await context.params;
        if (!serial) {
            return NextResponse.json({ error: "Device serial is required" }, { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const timespan = parseInt(searchParams.get("timespan") || "86400", 10);
        const forceRefresh = searchParams.get("refresh") === "true";

        const data = await getMerakiDeviceClients(
            serial,
            isNaN(timespan) ? 86400 : timespan,
            forceRefresh
        );
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[Meraki Device Clients API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to fetch Meraki device connected clients" },
            { status: 500 }
        );
    }
}
