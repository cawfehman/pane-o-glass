import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { investigateAccountLockout } from "@/lib/account-lockout";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Allow access only if user has explicit 'account-lockout' permission or is ADMIN
        const isPermitted = 
            role === "ADMIN" ||
            (await hasPermission(role, "account-lockout"));

        if (!isPermitted) {
            return NextResponse.json(
                { error: "Forbidden: Access to Account Lockout Investigator requires authorization." },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(req.url);
        const user = (searchParams.get("user") || "").trim();
        const rawRangeHours = parseInt(searchParams.get("rangeHours") || "24", 10);
        const rangeHours = isNaN(rawRangeHours) || rawRangeHours <= 0 ? 24 : Math.min(rawRangeHours, 168); // Max 7 days

        if (!user) {
            return NextResponse.json({ error: "Missing required query parameter: user" }, { status: 400 });
        }

        const result = await investigateAccountLockout(user, rangeHours);

        // Audit log the investigation
        try {
            await logAudit(
                "ACCOUNT_LOCKOUT_INVESTIGATE",
                `Investigated account lockout for '${result.searchedUser}' (${rangeHours}h window). Verdict: ${result.rootCauseCategory} (Lockouts: ${result.lockoutCount}, Failures: ${result.totalFailureEvents})`,
                session.user.id
            );
        } catch (auditErr) {
            console.warn("[Account-Lockout] Audit logging non-blocking error:", auditErr);
        }

        return NextResponse.json({
            success: true,
            data: result
        });
    } catch (err: any) {
        console.error("[Account-Lockout API] Error executing investigation:", err);
        return NextResponse.json(
            { error: err.message || "Failed to execute account lockout investigation" },
            { status: 500 }
        );
    }
}
