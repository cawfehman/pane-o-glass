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

        const { domain } = await request.json();

        if (!domain) {
            return new NextResponse("Domain parameter is required", { status: 400 });
        }

        // 2. Read HIBP API Key
        const apiKey = process.env.HIBP_API_KEY;
        if (!apiKey) {
            return new NextResponse("HIBP API Key not configured on server", { status: 500 });
        }

        // 3. Make the Request to HIBP (URL encoding the domain per spec required)
        const encodedDomain = encodeURIComponent(domain.trim());
        const clientIp = request.headers.get("x-forwarded-for")?.split(',')[0] || 'unknown';
        await logAudit("HIBP_DOMAIN_SEARCH", `Searched breaches for domain: ${domain}`, session.user?.id, clientIp);

        const response = await fetch(`https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(domain)}`, {
            headers: {
                "hibp-api-key": apiKey,
                "user-agent": "LinuxDash-Security-Tool"
            }
        });

        // 4. Handle HTTP Response Codes defined by HIBP Spec
        // 404 = Not found (Good news! No breaches on this domain)
        if (response.status === 404) {
            return NextResponse.json({ hasBreaches: false, aliases: {} });
        }

        // 403 = Forbidden (Domain not verified on the dashboard)
        if (response.status === 403) {
            return new NextResponse("Forbidden: This domain has not been verified on your HIBP account dashboard.", { status: 403 });
        }

        if (!response.ok) {
            // Forward other errors or rate limits (429) back to the client cleanly
            const message = await response.text();
            throw new Error(`HIBP API Error: ${response.status} - ${message}`);
        }

        // 200 = Found domain breaches
        // Format: { "alias1": ["Breach1", "Breach2"], "alias2": ["Breach2"] }
        const data = await response.json();

        return NextResponse.json({
            hasBreaches: true,
            aliases: data
        });

    } catch (error: any) {
        console.error("[HIBP_DOMAIN_PROXY_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
