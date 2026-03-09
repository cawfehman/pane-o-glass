import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const url = new URL(req.url);
        const apiKey = process.env.HIBP_API_KEY;

        if (!apiKey) {
            return new NextResponse("HIBP_API_KEY is not set", { status: 500 });
        }

        // The /breaches endpoint does not technically require an API key, 
        // but we proxy it to avoid any browser CORS issues.
        const hibpUrl = `https://haveibeenpwned.com/api/v3/breaches`;
        let endpoint = hibpUrl;

        // Check if just fetching meta or a specific breach
        const params = url.searchParams;
        if (params.get("breachName")) {
            endpoint = `https://haveibeenpwned.com/api/v3/breach/${params.get("breachName")}`;
            const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'unknown';
            await logAudit("HIBP_BREACH_SEARCH", `Searched for breach details: ${params.get("breachName")}`, session.user?.id, clientIp);
        }

        const response = await fetch(endpoint, {
            headers: {
                "hibp-api-key": apiKey,
                "user-agent": "InfoSec-Tools"
            }
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`HIBP API Error: ${response.status} - ${message}`);
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[HIBP_ALL_BREACHES_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
