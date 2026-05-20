import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";
import { obfuscateAuditAccount } from "@/lib/obfuscation";

export async function POST(request: Request) {
    try {
        const clientIp = request.headers.get("x-forwarded-for")?.split(',')[0] || 'unknown';

        // 1. Verify Authentication & Authorization
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'hibp-account'))) {
            await logAudit("UNAUTHORIZED_ACCESS", "Attempted to access HIBP Account Security tool without permission.", session?.user?.id, clientIp);
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const { account } = await request.json();

        if (!account) {
            return new NextResponse("Account parameter is required", { status: 400 });
        }

        // Domain restriction for cooperhealth.edu
        const sessionUsername = session.user?.name?.toLowerCase();
        const searchAccount = account.toLowerCase();
        const privilegedRoles = ['ADMIN', 'ANALYST', 'SYSTEMS'];
        if (searchAccount.endsWith("@cooperhealth.edu") && !privilegedRoles.includes(role)) {
            if (searchAccount !== sessionUsername && searchAccount !== `${sessionUsername}@cooperhealth.edu`) {
                const auditAccount = obfuscateAuditAccount(account);
                await logAudit("HIBP_ACCOUNT_SEARCH_BLOCKED", `Blocked unauthorized search for cooperhealth.edu account: ${auditAccount}`, session.user?.id, clientIp);
                return new NextResponse("Forbidden: cooperhealth.edu queries are limited to your own account. You may search for public addresses that you own, but other cooperhealth.edu queries are restricted. You can request assistance with additional account queries by reaching out to infosec@cooperhealth.edu", { status: 403 });
            }
        }

        // 2. Read HIBP API Key
        const apiKey = process.env.HIBP_API_KEY;
        if (!apiKey) {
            return new NextResponse("HIBP API Key not configured on server", { status: 500 });
        }

        // 3. Make the Request to HIBP (URL encoding the account per spec required)
        const auditAccount = obfuscateAuditAccount(account);
        await logAudit("HIBP_ACCOUNT_SEARCH", `Searched breaches for account: ${auditAccount}`, session.user?.id, clientIp);

        const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(account)}?truncateResponse=false`, {
            headers: {
                "hibp-api-key": apiKey,
                "user-agent": "InfoSec-Tools"
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
