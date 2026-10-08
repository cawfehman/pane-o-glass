import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role || "USER";
        const normalizedRole = String(role).toUpperCase();
        if (normalizedRole !== "ADMIN" && normalizedRole !== "ANALYST") {
            return NextResponse.json({ error: "Forbidden: Operator role required for session termination." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { username, ip, firewallId, dryRun = false, reason = "Manual disconnect requested by analyst" } = body;

        const target = username || ip;
        if (!target) {
            return NextResponse.json({ error: "Username or IP address is required to terminate an AnyConnect session." }, { status: 400 });
        }

        const sessionType = username ? "name" : "ipaddress";
        const targetFirewall = firewallId || "ra";

        const pythonBin = await resolvePythonCommand();
        const scriptPath = path.join(process.cwd(), "services", "firewall", "ftd_client.py");

        const args = [
            scriptPath,
            "--json",
            "--action", "ra_terminate",
            "--target", targetFirewall,
            "--session-type", sessionType
        ];

        if (username) {
            args.push("--username", username);
        } else {
            args.push("--ip", ip);
        }

        if (!dryRun) {
            args.push("--live");
        }

        const { stdout } = await execFileAsync(pythonBin, args, {
            cwd: process.cwd(),
            timeout: 25000,
            env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });

        const parsedOutput = JSON.parse(stdout);

        // Record audit trail
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
        const auditAction = dryRun ? "VPN_SESSION_TERMINATE_DRY_RUN" : "VPN_SESSION_TERMINATE_LIVE";
        const auditDetails = `${dryRun ? '[SIMULATION] ' : ''}Terminated AnyConnect session for '${target}' (${sessionType}) on gateway '${targetFirewall}'. Reason: ${reason}`;

        await logAudit(auditAction, auditDetails, session.user.id, clientIp).catch((e) => {
            console.error("[VPN-TERMINATE] Audit log error:", e);
        });

        return NextResponse.json({
            success: true,
            dryRun,
            target,
            sessionType,
            firewall: targetFirewall,
            results: parsedOutput
        });

    } catch (err: any) {
        console.error("[VPN-TERMINATE] Error:", err);
        return NextResponse.json({
            success: false,
            error: err.message || "Failed to execute session termination on firewall."
        }, { status: 500 });
    }
}
