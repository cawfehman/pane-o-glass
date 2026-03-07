import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
    try {
        // 1. Verify Authentication & Authorization
        const session = await auth();
        // Allow all logged-in users to query (or restrict to ADMIN if desired)
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { account } = await request.json();

        if (!account) {
            return new NextResponse("Account parameter is required", { status: 400 });
        }

        // 2. Read HIBP API Key
        const apiKey = process.env.HIBP_API_KEY;
        if (!apiKey) {
            return new NextResponse("HIBP API Key not configured on server", { status: 500 });
        }

        // 3. Make the Request to HIBP (URL encoding the account per spec required)
        const clientIp = request.headers.get("x-forwarded-for")?.split(',')[0] || 'unknown';
        await logAudit("HIBP_ACCOUNT_SEARCH", `Searched breaches for account: ${account}`, session.user?.id, clientIp);

        const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(account)}?truncateResponse=false`, {
            headers: {
                "hibp-api-key": apiKey,
                "user-agent": "LinuxDash-Security-Tool"
            }
        });

        // 4. Handle HTTP Response Codes defined by HIBP Spec
        // 404 = Not found (Good news! No breaches)
        if (response.status === 404) {
            return NextResponse.json({ hasBreaches: false, breaches: [] });
        }

        if (!response.ok) {
            // Forward other errors or rate limits (429) back to the client cleanly
            const message = await response.text();
            throw new Error(`HIBP API Error: ${response.status} - ${message}`);
        }

        // 200 = Found breaches
        const data = await response.json();

        return NextResponse.json({
            hasBreaches: true,
            breaches: data
        });

    } catch (error: any) {
        console.error("[HIBP_PROXY_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
