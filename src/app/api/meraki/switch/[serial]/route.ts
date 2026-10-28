import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getMerakiSwitchDetails } from "@/lib/meraki";

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
            return NextResponse.json({ error: "Switch serial is required" }, { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const forceRefresh = searchParams.get("refresh") === "true";

        const details = await getMerakiSwitchDetails(serial, forceRefresh);
        return NextResponse.json(details);
    } catch (error: any) {
        console.error("[Meraki Switch Inspector API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to fetch Meraki switch port details" },
            { status: 500 }
        );
    }
}
