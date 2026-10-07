import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { troubleshootTunnel } from "@/lib/s2s-vpn";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN diagnostics is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const tunnelId = typeof body.tunnelId === "string" ? body.tunnelId.trim() : "";
        const peerIp = typeof body.peerIp === "string" ? body.peerIp.trim() : "";

        if (!tunnelId && !peerIp) {
            return NextResponse.json({ error: "Either tunnelId or peerIp is required for troubleshooting" }, { status: 400 });
        }

        const report = await troubleshootTunnel(tunnelId, peerIp);

        await logAudit(
            "VPN_S2S_INVESTIGATE",
            `Executed live investigation on tunnel ${report.tunnelName} (Peer: ${report.peerIp}, Gateway: ${report.gatewayName}, Result: ${report.overallHealth} - ${report.failureCategory})`,
            session.user.id
        );

        return NextResponse.json({
            success: true,
            report,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error("Error executing S2S troubleshooting:", error);
        return NextResponse.json({ error: error.message || "Failed to troubleshoot S2S tunnel" }, { status: 500 });
    }
}
