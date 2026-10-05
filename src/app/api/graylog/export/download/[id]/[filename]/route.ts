import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { getStorageBasePath } from "@/lib/graylog-exporter";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string; filename: string }> }
) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { id, filename } = await params;
        const decodedFilename = decodeURIComponent(filename);

        // Prevent path traversal
        const safeFilename = path.basename(decodedFilename);
        const jobDir = path.resolve(getStorageBasePath(), id);
        const filePath = path.resolve(jobDir, safeFilename);

        // Security check: Must reside within jobDir
        if (!filePath.startsWith(jobDir)) {
            return new NextResponse("Bad Request: Invalid path traversal attempt.", { status: 400 });
        }

        if (!fs.existsSync(filePath)) {
            return new NextResponse("File Not Found or Export Expired", { status: 404 });
        }

        const stat = fs.statSync(filePath);
        let contentType = "application/octet-stream";
        if (safeFilename.endsWith(".zip")) {
            contentType = "application/zip";
        } else if (safeFilename.endsWith(".csv")) {
            contentType = "text/csv; charset=utf-8";
        } else if (safeFilename.endsWith(".ndjson") || safeFilename.endsWith(".json")) {
            contentType = "application/json; charset=utf-8";
        }

        // Stream file using Node readable stream converted to Web stream
        const nodeStream = fs.createReadStream(filePath);
        const webStream = new ReadableStream({
            start(controller) {
                nodeStream.on("data", (chunk) => controller.enqueue(chunk));
                nodeStream.on("end", () => controller.close());
                nodeStream.on("error", (err) => controller.error(err));
            },
            cancel() {
                nodeStream.destroy();
            },
        });

        return new NextResponse(webStream, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": stat.size.toString(),
                "Content-Disposition": `attachment; filename="${safeFilename}"`,
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        });
    } catch (err: any) {
        console.error("Download streaming error:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
