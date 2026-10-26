import { NextResponse } from "next/server";
import { getSecurityIntelligenceIps } from "../route";
import crypto from "crypto";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const tier = url.searchParams.get("tier") || "all";
        const { ips, metrics } = await getSecurityIntelligenceIps(tier);

        const lines: string[] = [
            `# ==============================================================================`,
            `# Cooper Health Security Intelligence Threat Feed (Cisco FTD / FMC)`,
            `# Generated: ${metrics.generatedAt}`,
            `# Total Active Threat Entries: ${metrics.total}`,
            `# Breakdown: CVE (${metrics.cveCount}) | Blacklist (${metrics.blacklistCount}) | Datacenter/VPS (${metrics.hostingCount}) | Active Residential (<7d) (${metrics.residentialCount})`,
            `# Recommended Action in FMC: Block with Reset`,
            `# ==============================================================================`
        ];

        for (const ip of ips) {
            lines.push(ip);
        }

        const body = lines.join("\n") + "\n";
        const md5 = crypto.createHash("md5").update(body).digest("hex");

        return new NextResponse(md5, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=300",
                "X-Total-Entries": String(metrics.total)
            }
        });
    } catch (error: any) {
        return new NextResponse("error", { status: 500 });
    }
}
