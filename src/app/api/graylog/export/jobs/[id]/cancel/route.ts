import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requestExportCancellation } from "@/lib/graylog-exporter";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const username = session?.user?.name || session?.user?.email || "Unknown User";
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        const job = await prisma.graylogExportJob.findUnique({ where: { id } });

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
            return NextResponse.json({ message: "Job is already finalized." });
        }

        requestExportCancellation(id);
        await prisma.graylogExportJob.update({
            where: { id },
            data: { status: "CANCELLED" },
        });

        await logAudit(
            "GRAYLOG_EXPORT_CANCELLED",
            `User '${username}' cancelled in-progress Graylog export job ${id} ("${job.title}").`,
            userId
        );

        return NextResponse.json({ success: true, message: "Export cancellation requested." });
    } catch (err: any) {
        console.error("Failed to cancel export job:", err);
        return NextResponse.json({ error: err.message || "Failed to cancel job" }, { status: 500 });
    }
}
