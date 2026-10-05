import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { getStorageBasePath } from "@/lib/graylog-exporter";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const jobs = await prisma.graylogExportJob.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        const now = new Date();
        const baseStoragePath = getStorageBasePath();

        const formattedJobs = jobs.map((j) => {
            const isExpired = j.status === "EXPIRED" || (j.expiresAt <= now && j.status === "COMPLETED");
            const jobDir = path.join(baseStoragePath, j.id);
            const hasDiskFiles = fs.existsSync(jobDir);

            // Time left in hours/minutes
            const msRemaining = j.expiresAt.getTime() - now.getTime();
            const hoursRemaining = msRemaining > 0 ? parseFloat((msRemaining / (1000 * 60 * 60)).toFixed(1)) : 0;

            return {
                id: j.id,
                title: j.title,
                query: j.query,
                cluster: j.cluster,
                streamId: j.streamId,
                streamName: j.streamName,
                from: j.from.toISOString(),
                to: j.to.toISOString(),
                format: j.format,
                status: isExpired ? "EXPIRED" : j.status,
                progress: j.progress,
                processedSlices: j.processedSlices,
                totalSlices: j.totalSlices,
                totalEvents: j.totalEvents,
                uncompressedBytes: j.uncompressedBytes,
                compressedBytes: j.compressedBytes,
                zipFileName: j.zipFileName,
                retentionHours: j.retentionHours,
                retentionReason: j.retentionReason,
                expiresAt: j.expiresAt.toISOString(),
                hoursRemaining,
                errorMessage: j.errorMessage,
                createdBy: j.createdBy,
                createdAt: j.createdAt.toISOString(),
                completedAt: j.completedAt ? j.completedAt.toISOString() : null,
                hasFiles: hasDiskFiles && !isExpired,
            };
        });

        return NextResponse.json({ jobs: formattedJobs });
    } catch (err: any) {
        console.error("Failed to load export jobs:", err);
        return NextResponse.json(
            { error: err.message || "Failed to load jobs" },
            { status: 500 }
        );
    }
}
