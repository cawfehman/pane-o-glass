import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { NodeSSH } from "node-ssh";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { isPrivateIp, getIpInfoLite } from "@/lib/ipinfo";

interface FwExecutionResult {
    hostId: string;
    target: string;
    success: boolean;
    stdout: string;
    stderr: string;
}

async function executeOnFirewall(fw: any, command: string): Promise<FwExecutionResult> {
    const sshHost = fw.ip;
    const username = fw.user;
    const password = fw.pass;
    const targetName = fw.name || sshHost;

    if (!username || !password || !sshHost) {
        return {
            hostId: fw.id,
            target: targetName,
            success: false,
            stdout: "",
            stderr: "Credentials or IP missing in FIREWALL_CONFIG"
        };
    }

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: sshHost,
            username: username,
            password: password,
            readyTimeout: 10000
        });

        return new Promise<FwExecutionResult>((resolve) => {
            ssh.requestShell().then((stream) => {
                let output = "";
                let errorOutput = "";

                stream.on("data", (data: any) => {
                    output += data.toString();
                });

                stream.stderr.on("data", (data: any) => {
                    errorOutput += data.toString();
                });

                stream.on("close", () => {
                    ssh.dispose();
                    const isSuccess = errorOutput.length === 0;
                    resolve({
                        hostId: fw.id,
                        target: targetName,
                        success: isSuccess,
                        stdout: output.trim(),
                        stderr: errorOutput.trim()
                    });
                });

                const waitForPrompt = (timeoutMs = 15000) => {
                    return new Promise((res) => {
                        const start = Date.now();
                        const check = () => {
                            const trimmed = output.trim();
                            if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
                                res(true);
                            } else if (Date.now() - start > timeoutMs) {
                                res(false);
                            } else {
                                setTimeout(check, 100);
                            }
                        };
                        check();
                    });
                };

                const runCommand = async () => {
                    await waitForPrompt(15000);
                    output = "";
                    stream.write(`${command}\n`);
                    await waitForPrompt(5000);
                    stream.write("exit\n");
                    await new Promise(r => setTimeout(r, 500));
                };

                runCommand();
            }).catch((shellError) => {
                ssh.dispose();
                resolve({
                    hostId: fw.id,
                    target: targetName,
                    success: false,
                    stdout: "",
                    stderr: `Failed to open shell: ${shellError.message}`
                });
            });
        });
    } catch (sshError: any) {
        return {
            hostId: fw.id,
            target: targetName,
            success: false,
            stdout: "",
            stderr: `SSH Connection Error: ${sshError.message}`
        };
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const body = await req.json();
        const { ipAddress, action, targetHost } = body;

        // Requester IP for audit
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

        if (!ipAddress || !action || !targetHost) {
            return new NextResponse("Missing required parameters (ipAddress, action, targetHost)", { status: 400 });
        }

        // Basic IPv4 validation
        const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipv4Regex.test(ipAddress)) {
            return new NextResponse("Invalid IPv4 address format", { status: 400 });
        }

        const allowedActions = ["show", "remove", "add", "shun"];
        if (!allowedActions.includes(action)) {
            return new NextResponse("Invalid action. Must be 'show', 'remove', or 'add'", { status: 400 });
        }

        // Safety Guardrail: Do not shun private or loopback IP spaces
        if ((action === "add" || action === "shun") && isPrivateIp(ipAddress)) {
            return NextResponse.json({
                error: "Safety Block: Cannot shun private/RFC1918 or loopback IP address spaces on perimeter firewalls."
            }, { status: 400 });
        }

        // Parse FIREWALL_CONFIG
        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let firewalls: any[] = [];
        try {
            firewalls = JSON.parse(configStr);
        } catch (e) {
            return new NextResponse("Invalid FIREWALL_CONFIG JSON configuration", { status: 500 });
        }

        let targetFws: any[] = [];
        let targetLabel = "";

        if (targetHost === "all") {
            targetFws = firewalls;
            targetLabel = "All Firewalls (Perimeter Fleet)";
        } else {
            const single = firewalls.find((fw: any) => fw.id === targetHost);
            if (!single) {
                return new NextResponse("Target host ID is not in the configured firewalls", { status: 403 });
            }
            targetFws = [single];
            targetLabel = single.name || single.ip;
        }

        // Determine CLI command
        let command = `show shun ${ipAddress}`;
        if (action === "remove") {
            command = `no shun ${ipAddress}`;
        } else if (action === "add" || action === "shun") {
            command = `shun ${ipAddress}`;
        }

        // Fetch IP geolocation/enrichment in parallel
        const ipInfo = await getIpInfoLite(ipAddress).catch(() => null);

        // Execute command across target firewall(s)
        const executionResults: FwExecutionResult[] = await Promise.all(
            targetFws.map(fw => executeOnFirewall(fw, command))
        );

        const overallSuccess = executionResults.some(r => r.success);
        const aggregatedStdout = executionResults
            .map(r => `=== ${r.target} ===\n${r.stdout || "(no output)"}`)
            .join("\n\n");
        const aggregatedStderr = executionResults
            .filter(r => r.stderr)
            .map(r => `[${r.target}] ${r.stderr}`)
            .join("\n");

        // Audit Logging
        if (overallSuccess) {
            let auditAction = "FIREWALL_SHUN_SHOW";
            let auditDesc = `Checked shun for ${ipAddress} on ${targetLabel}`;
            if (action === "remove") {
                auditAction = "FIREWALL_SHUN_REMOVE";
                auditDesc = `Removed shun for ${ipAddress} on ${targetLabel}`;
            } else if (action === "add" || action === "shun") {
                auditAction = "FIREWALL_SHUN_ADD";
                auditDesc = `Applied perimeter shun for ${ipAddress} on ${targetLabel}`;
            }

            await logAudit(
                auditAction,
                auditDesc,
                session.user?.id,
                clientIp
            ).catch(() => {});

            // If shun removed, clean up guardian blacklist if present
            if (action === "remove") {
                try {
                    const result = await prisma.guardianBlacklist.deleteMany({
                        where: { ip: ipAddress }
                    });
                    if (result.count > 0) {
                        await logAudit(
                            "GUARDIAN_BLACKLIST_CLEAR",
                            `IP ${ipAddress} was automatically removed from the Guardian blacklist as part of manual shun removal.`,
                            session.user?.id,
                            clientIp
                        );
                    }
                } catch (e: any) {
                    console.error("Failed to delete IP from GuardianBlacklist:", e.message);
                }
            }
        }

        // Dual audit to FirewallQueryHistory
        try {
            let historyCmd = "Check Shun";
            if (action === "remove") historyCmd = "Remove Shun";
            else if (action === "add" || action === "shun") historyCmd = "Apply Shun";

            await prisma.firewallQueryHistory.create({
                data: {
                    userId: session.user?.id,
                    command: historyCmd,
                    targetIp: ipAddress,
                    targetName: targetLabel,
                    ipAsn: ipInfo?.asn,
                    ipAsName: ipInfo?.as_name,
                    ipAsDomain: ipInfo?.as_domain,
                    ipCountry: ipInfo?.country,
                    ipCountryCode: ipInfo?.country_code
                }
            });
        } catch (e) {
            console.error("Failed to log firewall query to history:", e);
        }

        return NextResponse.json({
            success: overallSuccess,
            command: command,
            target: targetLabel,
            stdout: aggregatedStdout,
            stderr: aggregatedStderr,
            results: executionResults
        });

    } catch (error: any) {
        console.error("Firewall API Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
