import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { fetchS2sTunnels } from "@/lib/s2s-vpn";
import { isBooleanQuery, tokenizeQuery, parseTokensToAST, evaluateBooleanAST } from "@/lib/booleanQueryParser";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN tools is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const gateway = searchParams.get("gateway")?.trim() || null;
        const status = searchParams.get("status")?.trim() || null;
        const query = searchParams.get("q")?.trim().toLowerCase() || null;
        const forceRefresh = searchParams.get("refresh")?.trim() === "true";

        const data = await fetchS2sTunnels(forceRefresh);
        let tunnels = data.tunnels;

        if (gateway && gateway !== "all") {
            tunnels = tunnels.filter(t => t.gatewayId === gateway || t.gatewayName.toLowerCase().includes(gateway.toLowerCase()));
        }

        if (status && status !== "all") {
            tunnels = tunnels.filter(t => t.status.toLowerCase() === status.toLowerCase());
        }

        if (query) {
            const hasBool = isBooleanQuery(query);
            let ast: any = null;
            if (hasBool) {
                try { ast = parseTokensToAST(tokenizeQuery(query)); } catch (e) {}
            }
            if (ast) {
                tunnels = tunnels.filter(t => evaluateBooleanAST(t, ast, (tunnel: any, term: string) => {
                    const q = term.toLowerCase().trim();
                    if (!q) return true;
                    return (
                        tunnel.name.toLowerCase().includes(q) ||
                        tunnel.peerIp.toLowerCase().includes(q) ||
                        tunnel.peerDeviceName.toLowerCase().includes(q) ||
                        tunnel.fmcPolicyName.toLowerCase().includes(q) ||
                        tunnel.localSubnets.some((s: string) => s.toLowerCase().includes(q)) ||
                        tunnel.remoteSubnets.some((s: string) => s.toLowerCase().includes(q))
                    );
                }));
            } else {
                tunnels = tunnels.filter(t => 
                    t.name.toLowerCase().includes(query) ||
                    t.peerIp.toLowerCase().includes(query) ||
                    t.peerDeviceName.toLowerCase().includes(query) ||
                    t.fmcPolicyName.toLowerCase().includes(query) ||
                    t.localSubnets.some(s => s.toLowerCase().includes(query)) ||
                    t.remoteSubnets.some(s => s.toLowerCase().includes(query))
                );
            }
        }

        return NextResponse.json({
            success: true,
            tunnels,
            summary: data.summary,
            timestamp: data.timestamp
        });
    } catch (error: any) {
        console.error("Error fetching S2S VPN tunnels:", error);
        return NextResponse.json({ error: error.message || "Failed to load S2S VPN tunnels" }, { status: 500 });
    }
}
