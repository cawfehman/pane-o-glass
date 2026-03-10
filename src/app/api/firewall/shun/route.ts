import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { NodeSSH } from "node-ssh";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const body = await req.json();
        const { ipAddress, action, targetHost } = body;

        // Basic grab of the requester's IP if proxied
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

        const allowedActions = ["show", "remove"];
        if (!allowedActions.includes(action)) {
            return new NextResponse("Invalid action. Must be 'show' or 'remove'", { status: 400 });
        }

        // Verify targetHost (ID) is in our JSON config
        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let firewalls: any[] = [];
        try {
            firewalls = JSON.parse(configStr);
        } catch (e) {
            return new NextResponse("Invalid FIREWALL_CONFIG JSON configuration", { status: 500 });
        }

        const targetFirewall = firewalls.find((fw: any) => fw.id === targetHost);
        if (!targetFirewall) {
            return new NextResponse("Target host ID is not in the configured firewalls", { status: 403 });
        }

        const command = action === "show" ? `show shun ${ipAddress}` : `no shun ${ipAddress}`;

        const sshHost = targetFirewall.ip;
        const username = targetFirewall.user;
        const password = targetFirewall.pass;

        if (!username || !password || !sshHost) {
            return new NextResponse("Credentials or IP missing for the target firewall in FIREWALL_CONFIG", { status: 500 });
        }

        const ssh = new NodeSSH();
        const { getIpInfoLite } = await import("@/lib/ipinfo");
        const ipInfo = await getIpInfoLite(ipAddress);

        try {
            await ssh.connect({
                host: sshHost,
                username: username,
                password: password,
                readyTimeout: 10000
            });

            return new Promise((resolve, reject) => {
                ssh.requestShell().then((stream) => {
                    let output = "";
                    let errorOutput = "";

                    stream.on("data", (data: any) => {
                        output += data.toString();
                    });

                    stream.stderr.on("data", (data: any) => {
                        errorOutput += data.toString();
                    });

                    stream.on("close", async () => {
                        ssh.dispose();
                        const isSuccess = errorOutput.length === 0;

                        if (isSuccess) {
                            await logAudit(
                                action === "show" ? "FIREWALL_SHUN_SHOW" : "FIREWALL_SHUN_REMOVE",
                                `${action === "show" ? "Checked" : "Removed"} shun for ${ipAddress} on ${targetFirewall.name || sshHost}`,
                                session.user?.id,
                                clientIp
                            );
                        }

                        try {
                            await prisma.firewallQueryHistory.create({
                                data: {
                                    userId: session.user?.id,
                                    command: action === "show" ? "Check Shun" : "Remove Shun",
                                    targetIp: ipAddress,
                                    targetName: targetFirewall.name || sshHost,
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

                        resolve(NextResponse.json({
                            success: isSuccess,
                            command: command,
                            target: targetFirewall.name || sshHost,
                            stdout: output,
                            stderr: errorOutput
                        }));
                    });

                    // Send the command followed by a newline and exit
                    stream.write(`${command}\n`);
                    setTimeout(() => {
                        stream.write("exit\n");
                    }, 1000); // Give the firewall a second to process

                }).catch((shellError) => {
                    ssh.dispose();
                    console.error("Failed to request shell:", shellError);
                    resolve(NextResponse.json({
                        success: false,
                        error: "Failed to open interactive shell on firewall."
                    }, { status: 500 }));
                });
            });

        } catch (sshError: any) {
            console.error(`SSH Connection Error to ${targetHost}:`, sshError);
            return NextResponse.json({
                success: false,
                error: `Failed to connect or execute on ${targetHost}. ${sshError.message}`
            }, { status: 500 });
        }

    } catch (error) {
        console.error("Firewall API Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
