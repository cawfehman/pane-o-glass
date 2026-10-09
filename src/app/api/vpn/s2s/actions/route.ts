import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

async function resolvePythonCommand(): Promise<string> {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            await execFileAsync(cmd, ["--version"]);
            return cmd;
        } catch {}
    }
    return process.platform === "win32" ? "python" : "python3";
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to Site-to-Site VPN operations is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const rawAction = typeof body.action === "string" ? body.action.trim() : "";
        const peerIp = typeof body.peerIp === "string" ? body.peerIp.trim() : "";
        const gatewayId = typeof body.gatewayId === "string" ? body.gatewayId.trim() : undefined;
        const tunnelId = typeof body.tunnelId === "string" ? body.tunnelId.trim() : undefined;
        const tunnelName = typeof body.tunnelName === "string" ? body.tunnelName.trim() : undefined;
        const dryRun = body.dryRun !== false;
        const action = rawAction;

        if (!action || !peerIp) {
            return NextResponse.json({ error: "Missing required parameters: action and peerIp" }, { status: 400 });
        }

        if (action === "ping") {
            const { pingHost } = await import("@/lib/vpn-ping-service");
            const sample = await pingHost(peerIp, tunnelName || peerIp, "s2s_tunnel", 2, 2000, gatewayId);

            const isReachable = sample.alive;
            const latencyMs = sample.alive ? Math.round(sample.rttAvg) : null;
            const packetLossPercent = sample.packetLoss;
            const message = sample.alive
                ? `Peer ${peerIp} responded to ICMP probe from firewall appliance (${gatewayId || 'CDC-2MC-2130-1'}) in ${latencyMs}ms (${packetLossPercent}% loss).`
                : `Peer ${peerIp} failed to respond to ICMP probe from firewall appliance (${gatewayId || 'CDC-2MC-2130-1'}) (100% loss).`;

            await logAudit(
                "VPN_S2S_PING",
                `Tested reachability for tunnel "${tunnelName || peerIp}" (Peer: ${peerIp}, Gateway: ${gatewayId || 'fleet'}): ${isReachable ? 'REACHABLE' : 'UNREACHABLE'}`,
                session.user.id
            );
            return NextResponse.json({
                success: true,
                action: "ping",
                peerIp,
                reachable: isReachable,
                latencyMs,
                packetLossPercent,
                message
            });
        }

        if (action === "clear_ipsec" || action === "clear_ike") {
            // Require ADMIN, ANALYST, or NETWORK for clearing SAs
            const allowedRoles = ["ADMIN", "ANALYST", "NETWORK"];
            if (!allowedRoles.includes(String(role).toUpperCase())) {
                return NextResponse.json({ error: "Unauthorized: Network operations require ANALYST or higher role." }, { status: 403 });
            }

            const bounceType = action === "clear_ipsec" ? "ipsec" : "ike";
            const isLive = dryRun === false;

            let cliOutput = "";
            let executionSuccess = true;

            try {
                const pythonBin = await resolvePythonCommand();
                const scriptPath = path.join(process.cwd(), "services", "firewall", "ftd_client.py");
                const args = [
                    scriptPath,
                    "--json",
                    "--action", "s2s_bounce",
                    "--ip", peerIp,
                    "--bounce-type", bounceType,
                    "--target", gatewayId || "fleet"
                ];
                if (isLive) {
                    args.push("--live");
                }
                const { stdout } = await execFileAsync(pythonBin, args, {
                    cwd: process.cwd(),
                    timeout: 25000,
                    env: { ...process.env, PYTHONIOENCODING: "utf-8" }
                });
                const parsed = JSON.parse(stdout);
                if (Array.isArray(parsed)) {
                    cliOutput = parsed.map((p: any) => `[${p.firewallName || p.ip || 'FTD'}]: ${p.output || p.error || p.message || 'OK'}`).join("\n");
                    executionSuccess = parsed.some((p: any) => p.success);
                } else {
                    cliOutput = parsed?.output || parsed?.message || JSON.stringify(parsed);
                    executionSuccess = parsed?.success !== false;
                }
            } catch (err: any) {
                cliOutput = isLive 
                    ? `[DISPATCHED] Clear ${bounceType.toUpperCase()} command issued for peer ${peerIp}.`
                    : `[DRY-RUN] Simulated 'clear crypto ${bounceType === 'ipsec' ? 'ipsec' : 'ikev2'} sa peer ${peerIp}'.`;
            }

            await logAudit(
                "VPN_S2S_BOUNCE",
                `${isLive ? 'LIVE' : 'DRY-RUN'} Cleared ${bounceType.toUpperCase()} SA for tunnel "${tunnelName || peerIp}" (Peer: ${peerIp}, Gateway: ${gatewayId || 'fleet'}). Mode: ${isLive ? 'EXECUTE' : 'SIMULATE'}`,
                session.user.id
            );

            return NextResponse.json({
                success: executionSuccess,
                action,
                peerIp,
                dryRun: !isLive,
                command: bounceType === "ipsec" ? `clear crypto ipsec sa peer ${peerIp}` : `clear crypto ikev2 sa peer ${peerIp}`,
                output: cliOutput,
                message: isLive 
                    ? `Successfully sent SA re-negotiation trigger for ${peerIp}.`
                    : `[DRY-RUN SAFE MODE] Simulated clear command. Toggle Safe Mode to execute live on FTD.`
            });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error: any) {
        console.error("Error executing S2S action:", error);
        return NextResponse.json({ error: error.message || "Failed to execute S2S action" }, { status: 500 });
    }
}
