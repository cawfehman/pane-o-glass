import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const snapshotId = searchParams.get("snapshotId");
        const fileName = searchParams.get("file");
        const download = searchParams.get("download") === "1" || searchParams.get("download") === "true";

        const runsDir = path.join(process.cwd(), "services", "crawler", "logs", "runs");
        if (!fs.existsSync(runsDir)) {
            return NextResponse.json({ logs: [] });
        }

        // If specific snapshotId requested
        if (snapshotId) {
            const targetFile = path.join(runsDir, `crawl_snapshot_${snapshotId}.log`);
            if (!fs.existsSync(targetFile)) {
                return NextResponse.json({ error: "Log file not found for this snapshot." }, { status: 404 });
            }

            const content = fs.readFileSync(targetFile, "utf-8");
            if (download) {
                return new Response(content, {
                    headers: {
                        "Content-Type": "text/plain; charset=utf-8",
                        "Content-Disposition": `attachment; filename="crawl_snapshot_${snapshotId}.log"`
                    }
                });
            }

            const stat = fs.statSync(targetFile);
            return NextResponse.json({
                success: true,
                snapshotId,
                filename: `crawl_snapshot_${snapshotId}.log`,
                sizeBytes: stat.size,
                createdAt: stat.mtime.toISOString(),
                log: content
            });
        }

        // If specific file requested
        if (fileName) {
            const safeName = path.basename(fileName);
            const targetFile = path.join(runsDir, safeName);
            if (!fs.existsSync(targetFile)) {
                return NextResponse.json({ error: "Specified log file not found." }, { status: 404 });
            }

            const content = fs.readFileSync(targetFile, "utf-8");
            if (download) {
                return new Response(content, {
                    headers: {
                        "Content-Type": "text/plain; charset=utf-8",
                        "Content-Disposition": `attachment; filename="${safeName}"`
                    }
                });
            }

            const stat = fs.statSync(targetFile);
            return NextResponse.json({
                success: true,
                filename: safeName,
                sizeBytes: stat.size,
                createdAt: stat.mtime.toISOString(),
                log: content
            });
        }

        // Otherwise list all log files in runs/
        const files = fs.readdirSync(runsDir)
            .filter(f => f.endsWith(".log"))
            .map(f => {
                const fullPath = path.join(runsDir, f);
                const stat = fs.statSync(fullPath);
                const snapMatch = f.match(/crawl_snapshot_(.+)\.log/);
                return {
                    filename: f,
                    snapshotId: snapMatch ? snapMatch[1] : null,
                    sizeBytes: stat.size,
                    modifiedAt: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        return NextResponse.json({ logs: files });
    } catch (error: any) {
        console.error("Failed to query crawler logs:", error);
        return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
    }
}
