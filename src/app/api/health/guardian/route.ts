import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const guardianJob = await prisma.backgroundJob.findUnique({
            where: { name: "Firewall Guardian" }
        });

        const watchListRaw = process.env.WATCH_IP_LIST || "";
        const watchList = watchListRaw.split(',').filter(ip => ip.trim() !== "");

        const isLive = guardianJob && (new Date().getTime() - new Date(guardianJob.lastRun).getTime() < 300000);

        return NextResponse.json({
            isLive,
            status: guardianJob?.status || "UNKNOWN",
            lastRun: guardianJob?.lastRun || null,
            watchList
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch health status" }, { status: 500 });
    }
}
