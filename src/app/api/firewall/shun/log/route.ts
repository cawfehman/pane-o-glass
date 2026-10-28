import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getRecentShunActionLogs, getShunActionLogFilePath, getShunActionLogText } from "@/lib/shun-logger";
import fs from "fs";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "firewall", userId))) {
            return NextResponse.json({ error: "Forbidden: Access restricted to firewall operators." }, { status: 403 });
        }

        const url = new URL(req.url);
        const download = url.searchParams.get("download") === "true";
        const raw = url.searchParams.get("raw") === "true";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);

        if (download) {
            const filePath = getShunActionLogFilePath();
            if (!fs.existsSync(filePath)) {
                return new NextResponse("Log file does not exist yet.", { status: 404 });
            }

            const fileBuffer = fs.readFileSync(filePath);
            const dateStr = new Date().toISOString().split("T")[0];
            return new NextResponse(fileBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Content-Disposition": `attachment; filename="firewall-shun-actions-${dateStr}.log"`,
                },
            });
        }

        if (raw) {
            const rawText = getShunActionLogText();
            return new NextResponse(rawText, {
                status: 200,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                },
            });
        }

        const entries = getRecentShunActionLogs(Math.min(limit, 100));
        return NextResponse.json({
            success: true,
            count: entries.length,
            entries,
            logFilePath: "logs/shun-actions.log",
        });
    } catch (e: any) {
        console.error("Failed to fetch shun action log:", e);
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}
