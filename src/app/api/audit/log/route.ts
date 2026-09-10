import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { action, details } = body;

        if (!action || typeof action !== "string" || !details || typeof details !== "string") {
            return new NextResponse("Invalid audit log parameters", { status: 400 });
        }

        const clientIp = request.headers.get("x-forwarded-for")?.split(',')[0] || 'unknown';
        await logAudit(action, details, session.user.id, clientIp);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[AUDIT_LOG_CLIENT_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
