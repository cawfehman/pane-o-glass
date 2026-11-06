import { NextResponse } from "next/server";
import { getSecurityIntelligenceFeed, getSecurityIntelligenceWhitelistFeed } from "../route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const feedType = (url.searchParams.get("feed") || url.searchParams.get("type") || "block").toLowerCase();
        const tier = url.searchParams.get("tier") || "all";
        const key = url.searchParams.get("key");

        // Validate authorization before mutating poll setting
        const requiredKey = process.env.SECURITY_INTELLIGENCE_KEY;
        if (requiredKey && key !== requiredKey) {
            const session = await auth().catch(() => null);
            if (!session?.user) {
                return new NextResponse("Unauthorized: Invalid Security Intelligence Key", { status: 401 });
            }
        }

        const isWhitelist = feedType === "whitelist" || feedType === "do-not-block" || feedType === "allow";

        // Track last poll timestamp for FMC dynamic hold synchronization
        const pollKey = isWhitelist ? "LAST_FMC_SI_WHITELIST_POLL" : "LAST_FMC_SI_POLL";
        await prisma.netscalerCveSetting.upsert({
            where: { key: pollKey },
            update: { value: new Date().toISOString() },
            create: { key: pollKey, value: new Date().toISOString() }
        }).catch(() => {});

        if (isWhitelist) {
            const { md5, metrics } = await getSecurityIntelligenceWhitelistFeed();
            return new NextResponse(md5.trim(), {
                status: 200,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "public, max-age=60",
                    "X-Total-Entries": String(metrics.total),
                    "X-Feed-Type": "whitelist"
                }
            });
        }

        const { md5, metrics } = await getSecurityIntelligenceFeed(tier);

        return new NextResponse(md5.trim(), {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=60",
                "X-Total-Entries": String(metrics.total),
                "X-Feed-Type": "block"
            }
        });
    } catch (error: any) {
        return new NextResponse("error", { status: 500 });
    }
}
