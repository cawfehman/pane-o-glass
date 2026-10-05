import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { executeExportJob, getStorageBasePath } from "@/lib/graylog-exporter";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const username = session?.user?.name || session?.user?.email || "Unknown User";
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const {
            title,
            cluster,
            query,
            from,
            to,
            streamId,
            streamName,
            fields,
            format,
            retentionHours: rawRetentionHours,
            retentionReason,
        } = body;

        if (!cluster || !from || !to) {
            return NextResponse.json(
                { error: "Missing required fields: cluster, from, to." },
                { status: 400 }
            );
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
            return NextResponse.json(
                { error: "Invalid date range." },
                { status: 400 }
            );
        }

        // Retention enforcement
        let retentionHours = parseInt(rawRetentionHours, 10) || 24;
        if (retentionHours < 1) retentionHours = 24;
        if (retentionHours > 168) retentionHours = 168; // Max 7 days

        if (retentionHours > 24) {
            if (!retentionReason || !retentionReason.trim()) {
                return NextResponse.json(
                    { error: "A business justification reason is mandatory when extending retention beyond 24 hours (up to 7 days max)." },
                    { status: 400 }
                );
            }

            await logAudit(
                "GRAYLOG_EXPORT_EXTENDED_RETENTION",
                `User '${username}' requested extended retention of ${retentionHours} hours for export "${title || query || 'Graylog Export'}". Justification: ${retentionReason.trim()}`,
                userId
            );
        }

        const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);
        const jobTitle = title && title.trim() ? title.trim() : `Graylog Export - ${cluster} (${new Date().toLocaleDateString()})`;

        const exportFormat = format === "ndjson" ? "ndjson" : "csv";
        const fieldsJson = JSON.stringify(Array.isArray(fields) && fields.length > 0 ? fields : ["timestamp", "source", "message"]);

        const job = await prisma.graylogExportJob.create({
            data: {
                title: jobTitle,
                query: query || "*",
                cluster,
                streamId: streamId && streamId !== "all" ? streamId : null,
                streamName: streamName || null,
                from: fromDate,
                to: toDate,
                fields: fieldsJson,
                format: exportFormat,
                status: "PLANNING",
                progress: 0,
                storageDir: path.join(getStorageBasePath(), "pending"), // will be updated
                retentionHours,
                retentionReason: retentionHours > 24 ? retentionReason.trim() : null,
                expiresAt,
                createdBy: username,
            },
        });

        // Update real storage dir with generated job ID
        const finalStorageDir = path.join(getStorageBasePath(), job.id);
        await prisma.graylogExportJob.update({
            where: { id: job.id },
            data: { storageDir: finalStorageDir },
        });

        await logAudit(
            "GRAYLOG_EXPORT_INITIATED",
            `User '${username}' started Graylog bulk export job ${job.id} ("${jobTitle}"). Range: ${fromDate.toISOString()} to ${toDate.toISOString()}, Cluster: ${cluster}, Retention: ${retentionHours}h`,
            userId
        );

        // Fire background export asynchronously without awaiting
        executeExportJob(job.id).catch((err) => {
            console.error(`Background export execution failed for job ${job.id}:`, err);
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            title: jobTitle,
            expiresAt: expiresAt.toISOString(),
            status: "PLANNING",
        });
    } catch (err: any) {
        console.error("Export execution error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to execute export job" },
            { status: 500 }
        );
    }
}
