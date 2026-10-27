import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export const dynamic = "force-dynamic";

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

        // 1. Database watch IPs
        const dbWatch = await prisma.guardianWatchIp.findMany({ select: { ip: true } });
        const watchSet = new Set<string>(dbWatch.map(w => w.ip.trim()).filter(Boolean));

        // 2. Also read directly from .env file and process.env so disk edits are immediately reflected
        try {
            const envPath = path.resolve(process.cwd(), ".env");
            let diskVal = "";
            if (fs.existsSync(envPath)) {
                const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
                diskVal = parsed["WATCH_IP_LIST"] || parsed["GUARDIAN_WATCH_IP_LIST"] || "";
            }
            const envIps = [diskVal, process.env.WATCH_IP_LIST || ""].join(",").split(",").map(ip => ip.trim()).filter(Boolean);
            envIps.forEach(ip => watchSet.add(ip));
        } catch (e) {}

        const watchList = Array.from(watchSet);
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
