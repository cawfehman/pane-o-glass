import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Fetch all logs (the 30-day rotation handles limit)
        const logs = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { username: true } }
            }
        });

        // Generate CSV string
        const headers = ["ID", "Timestamp", "User", "Action", "Details", "IP Address"];
        const rows = logs.map(log => [
            log.id,
            new Date(log.createdAt).toISOString(),
            log.user?.username || log.userId || "System",
            log.action,
            // Wrap details in quotes in case it has commas
            `"${log.details.replace(/"/g, '""')}"`,
            log.ipAddress || "Internal"
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n");

        return new NextResponse(csvContent, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="linuxdash_audit_export_${new Date().toISOString().split('T')[0]}.csv"`
            }
        });

    } catch (error) {
        console.error("Failed to export audit logs:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
