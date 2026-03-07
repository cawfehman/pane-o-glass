import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        // Track the probe
        let clientIp = 'internal';
        const forwardedFor = typeof req?.headers?.get === 'function'
            ? req.headers.get("x-forwarded-for")
            : (req?.headers as any)?.["x-forwarded-for"];

        if (forwardedFor) {
            clientIp = String(forwardedFor).split(',')[0].trim();
        }

        const userAgent = typeof req?.headers?.get === 'function'
            ? req.headers.get("user-agent")
            : (req?.headers as any)?.["user-agent"];

        // Add to database asynchronously so we don't block the health response
        prisma.healthProbe.create({
            data: {
                ipAddress: clientIp,
                userAgent: userAgent || "Unknown"
            }
        }).catch(e => console.error("Failed to log health probe", e));

        // Delete probes older than 7 days to keep it clean, also async
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        prisma.healthProbe.deleteMany({
            where: { createdAt: { lt: sevenDaysAgo } }
        }).catch(e => console.error("Failed to clean health probes", e));

        return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() }, { status: 200 });
    } catch (e) {
        return NextResponse.json({ status: "error" }, { status: 500 });
    }
}
