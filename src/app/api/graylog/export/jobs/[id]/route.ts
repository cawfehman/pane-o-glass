import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getStorageBasePath } from "@/lib/graylog-exporter";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        const job = await prisma.graylogExportJob.findUnique({ where: { id } });

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        const jobDir = path.join(getStorageBasePath(), id);
        let files: { name: string; sizeBytes: number; isZip: boolean; isMaster: boolean; isManifest: boolean }[] = [];

        if (fs.existsSync(jobDir)) {
            const rawFiles = fs.readdirSync(jobDir);
            files = rawFiles.map((fname) => {
                const stat = fs.statSync(path.join(jobDir, fname));
                return {
                    name: fname,
                    sizeBytes: stat.size,
                    isZip: fname.endsWith(".zip"),
                    isMaster: fname.startsWith("master_export"),
                    isManifest: fname === "export_manifest.json",
                };
            }).sort((a, b) => {
                if (a.isZip) return -1;
                if (b.isZip) return 1;
                if (a.isMaster) return -1;
                if (b.isMaster) return 1;
                return a.name.localeCompare(b.name);
            });
        }

        return NextResponse.json({ job, files });
    } catch (err: any) {
        console.error("Failed to get export job:", err);
        return NextResponse.json({ error: err.message || "Failed to get job" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

        const jobDir = path.join(getStorageBasePath(), id);
        if (fs.existsSync(jobDir)) {
            try {
                fs.rmSync(jobDir, { recursive: true, force: true });
            } catch (e: any) {
                console.error(`Failed to delete disk files for job ${id}:`, e.message);
            }
        }

        await prisma.graylogExportJob.delete({ where: { id } });

        await logAudit(
            "GRAYLOG_EXPORT_MANUAL_DELETE",
            `User '${username}' manually deleted Graylog export job ${id} ("${job.title}") and purged its files from storage.`,
            userId
        );

        return NextResponse.json({ success: true, message: "Export deleted successfully" });
    } catch (err: any) {
        console.error("Failed to delete export job:", err);
        return NextResponse.json({ error: err.message || "Failed to delete job" }, { status: 500 });
    }
}
