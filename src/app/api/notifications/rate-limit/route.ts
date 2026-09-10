import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getSmtpSendRateConfig } from "@/lib/smtp";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const rateConfig = getSmtpSendRateConfig();
        return NextResponse.json(rateConfig);
    } catch (err: any) {
        return new NextResponse(err.message || "Failed to fetch rate limit config", { status: 500 });
    }
}
