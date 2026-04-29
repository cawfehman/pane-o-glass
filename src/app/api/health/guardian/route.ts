import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const guardianJob = await prisma.backgroundJob.findUnique({
            where: { name: "Firewall Guardian" }
        });

        const watchListRaw = process.env.WATCH_IP_LIST || "";
        const watchList = watchListRaw.split(',').filter(ip => ip.trim() !== "");

        const isLive = guardianJob && (new Date().getTime() - new Date(guardianJob.lastRun).getTime() < 300000);

        return NextResponse.json({
            isLive,
            lastRun: guardianJob?.lastRun || null,
            watchList
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch health status" }, { status: 500 });
    }
}
