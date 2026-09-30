import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getIpInfoLite, isPrivateIp } from "@/lib/ipinfo";
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
        } catch {
            // continue probe
        }
    }
    return process.platform === "win32" ? "python" : "python3";
}

async function runFtdClient(args: string[]): Promise<any> {
    const pythonBin = await resolvePythonCommand();
    const scriptPath = path.join(process.cwd(), "services", "firewall", "ftd_client.py");

    const fullArgs = [scriptPath, "--json", ...args];

    try {
        const { stdout } = await execFileAsync(pythonBin, fullArgs, {
            cwd: process.cwd(),
            timeout: 60000,
            env: {
                ...process.env,
                PYTHONIOENCODING: "utf-8",
                PYTHONUNBUFFERED: "1"
            }
        });

        return JSON.parse(stdout);
    } catch (err: any) {
        console.error("[FTD-CLIENT-RUNNER] Error:", err.message);
        throw new Error(err.stderr || err.message || "Failed to execute FTD client");
    }
}

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// GET /api/firewall/v2
// Query params: action=fleet_status | check_ip | hosts | live_shuns
export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        // Admin-only gating for V2 preview
        if (!session?.user || role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized: Administrator access required for FTD Operations Center" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action") || "fleet_status";
        const ip = searchParams.get("ip")?.trim() || "";
        const target = searchParams.get("target")?.trim() || "fleet";

        if (action === "hosts") {
            const configStr = process.env.FIREWALL_CONFIG || "[]";
            let firewalls: any[] = [];
            try {
                firewalls = JSON.parse(configStr);
            } catch {}
            const hosts = firewalls.map((fw: any) => ({
                id: fw.id,
                name: fw.name || fw.ip,
                ip: fw.ip
            }));
            return NextResponse.json({ hosts });
        }

        if (action === "fleet_status") {
            const results = await runFtdClient(["--action", "version", "--target", target]);
            return NextResponse.json({ success: true, timestamp: new Date().toISOString(), results });
        }

        if (action === "check_ip") {
            if (!ip || !IPV4_REGEX.test(ip)) {
                return NextResponse.json({ error: "A valid IPv4 address is required" }, { status: 400 });
            }

            // 1. Parallel live query on firewalls
            const fwResultsPromise = runFtdClient(["--action", "check", "--ip", ip, "--target", target]);

            // 2. Correlate with local DB & Geo intelligence
            const [fwResults, geoInfo, vpnSessions, blacklistEntry, guardianHistory] = await Promise.all([
                fwResultsPromise,
                getIpInfoLite(ip).catch(() => null),
                prisma.vpnEvent.findMany({
                    where: { sourceIp: ip },
                    take: 5,
                    orderBy: { createdAt: "desc" },
                    select: {
                        username: true,
                        status: true,
                        vpnStream: true,
                        createdAt: true,
                        adDisplayName: true
                    }
                }).catch(() => []),
                prisma.guardianBlacklist.findUnique({
                    where: { ip }
                }).catch(() => null),
                prisma.guardianEvent.findMany({
                    where: { ip },
                    take: 5,
                    orderBy: { createdAt: "desc" }
                }).catch(() => [])
            ]);

            const isPrivate = isPrivateIp(ip);

            return NextResponse.json({
                success: true,
                targetIp: ip,
                isPrivate,
                geoInfo,
                vpnSessions,
                blacklistEntry,
                guardianHistory,
                fleetResults: fwResults
            });
        }

        if (action === "live_shuns") {
            const results = await runFtdClient(["--action", "show_all", "--target", target]);
            return NextResponse.json({ success: true, timestamp: new Date().toISOString(), results });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

    } catch (e: any) {
        console.error("[API-FIREWALL-V2-GET] Error:", e);
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}

// POST /api/firewall/v2
// Body: { action: "shun" | "unshun", ip: string, target?: "fleet" | string, dryRun?: boolean }
export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        // Admin-only gating
        if (!session?.user || role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized: Administrator access required" }, { status: 403 });
        }

        const body = await req.json();
        const { action, ip, target = "fleet", dryRun = true } = body;

        if (!action || !["shun", "unshun"].includes(action)) {
            return NextResponse.json({ error: "Invalid action. Must be 'shun' or 'unshun'." }, { status: 400 });
        }

        if (!ip || !IPV4_REGEX.test(ip)) {
            return NextResponse.json({ error: "A valid IPv4 address is required" }, { status: 400 });
        }

        // Safety Guardrail: Prevent shunning private IPs unless dryRun
        if (action === "shun" && isPrivateIp(ip) && !dryRun) {
            return NextResponse.json({
                error: "Safety Block: Cannot shun private/RFC1918 IP address spaces on perimeter firewalls."
            }, { status: 400 });
        }

        const args = ["--action", action, "--ip", ip, "--target", target];
        if (!dryRun) {
            args.push("--live");
        }

        const results = await runFtdClient(args);

        // Audit log
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
        const actionLabel = action === "unshun" ? "FTD_V2_UNSHUN" : "FTD_V2_SHUN";
        const modeDesc = dryRun ? "[DRY-RUN SIMULATION]" : "[LIVE HARDWARE EXECUTION]";
        
        await logAudit(
            actionLabel,
            `${modeDesc} ${action.toUpperCase()} ${ip} on target '${target}'. Results: ${JSON.stringify(results.map((r: any) => ({ name: r.firewallName, success: r.success })))}`,
            session.user?.id,
            clientIp
        ).catch(() => {});

        // Dual-audit to FirewallQueryHistory for Operations History tab visibility
        await prisma.firewallQueryHistory.create({
            data: {
                userId: session.user?.id,
                command: `${modeDesc} ${action.toUpperCase()}`,
                targetIp: ip,
                targetName: target === "fleet" ? "FTD Fleet (All 4 Nodes)" : target
            }
        }).catch((err) => console.error("Failed to log V2 mutation to firewallQueryHistory:", err));

        return NextResponse.json({
            success: true,
            action,
            targetIp: ip,
            dryRun,
            target,
            results
        });

    } catch (e: any) {
        console.error("[API-FIREWALL-V2-POST] Error:", e);
        return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
    }
}
