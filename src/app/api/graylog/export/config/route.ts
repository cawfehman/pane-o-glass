import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getClustersConfig, fetchStreamsForCluster } from "@/lib/graylog-exporter";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "graylog-exporter"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const clusters = getClustersConfig();

        // Fetch streams for all clusters in parallel
        const clusterData = await Promise.all(
            clusters.map(async (c) => {
                const streams = await fetchStreamsForCluster(c.id);
                return {
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    streams,
                };
            })
        );

        return NextResponse.json({ clusters: clusterData });
    } catch (err: any) {
        console.error("Failed to load Graylog export config:", err);
        return NextResponse.json({ error: err.message || "Failed to load config" }, { status: 500 });
    }
}
