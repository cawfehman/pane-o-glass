import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchIseSession } from "@/lib/ise";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";

export async function GET(request: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ise'))) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get("query");

        if (!query) {
            return new NextResponse("Missing query parameter", { status: 400 });
        }

        // Try to capture IP for audit
        let clientIp = 'internal';
        try {
            const forwardedFor = typeof request.headers.get === 'function'
                ? request.headers.get("x-forwarded-for")
                : (request.headers as any)?.["x-forwarded-for"];
            if (forwardedFor) {
                clientIp = String(forwardedFor).split(',')[0].trim();
            }
        } catch (e) { }

        // Audit the search action
        const userId = (session.user as any)?.id;
        await logAudit("ISE_SESSION_SEARCH", `Searched ISE for endpoint: ${query}`, userId, clientIp);

        // Perform the ISE lookup
        const result = await fetchIseSession(query);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("ISE Session API Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to query Cisco ISE" },
            { status: 500 }
        );
    }
}
