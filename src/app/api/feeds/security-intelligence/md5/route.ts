import { NextResponse } from "next/server";
import { getSecurityIntelligenceFeed } from "../route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const tier = url.searchParams.get("tier") || "all";
        const key = url.searchParams.get("key");

        // Validate authorization before mutating LAST_FMC_SI_POLL
        const requiredKey = process.env.SECURITY_INTELLIGENCE_KEY;
        if (requiredKey && key !== requiredKey) {
            const session = await auth().catch(() => null);
            if (!session?.user) {
                return new NextResponse("Unauthorized: Invalid Security Intelligence Key", { status: 401 });
            }
        }

        // Track last poll timestamp for FMC dynamic hold synchronization
        await prisma.netscalerCveSetting.upsert({
            where: { key: "LAST_FMC_SI_POLL" },
            update: { value: new Date().toISOString() },
            create: { key: "LAST_FMC_SI_POLL", value: new Date().toISOString() }
        }).catch(() => {});

        const { md5, metrics } = await getSecurityIntelligenceFeed(tier);

        return new NextResponse(md5.trim(), {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=60",
                "X-Total-Entries": String(metrics.total)
            }
        });
    } catch (error: any) {
        return new NextResponse("error", { status: 500 });
    }
}
