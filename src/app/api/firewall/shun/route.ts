import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { NodeSSH } from "node-ssh";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Optional: restrict to ADMIN role
        // const isAdmin = (session?.user as any)?.role === 'ADMIN';
        // if (!isAdmin) return new NextResponse("Forbidden", { status: 403 });

        const body = await req.json();
        const { ipAddress, action, targetHost } = body;

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

        // Verify targetHost is in our allowed list
        const hostsStr = process.env.FIREWALL_HOSTS || "";
        const allowedHosts = hostsStr.split(",").map(h => h.trim());
        if (!allowedHosts.includes(targetHost)) {
            return new NextResponse("Target host is not in the allowed configuration listing", { status: 403 });
        }

        const command = action === "show" ? `show shun ${ipAddress}` : `no shun ${ipAddress}`;

        const username = process.env.FIREWALL_USER;
        const password = process.env.FIREWALL_PASS;

        if (!username || !password) {
            return new NextResponse("Firewall credentials are not configured on the server", { status: 500 });
        }

        const ssh = new NodeSSH();

        try {
            await ssh.connect({
                host: targetHost,
                username: username,
                password: password,
                // Cisco CLI often requires specific cipher/kex or works differently,
                // but node-ssh handles standard SSH2 well. Specific algorithms might
                // need to be defined if the firewall is older.
                readyTimeout: 10000
            });

            // Cisco ASA / pyos.sh environments often do not support `exec` channels gracefully (which `execCommand` uses).
            // They expect a standard interactive shell.

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

                    stream.on("close", () => {
                        ssh.dispose();
                        resolve(NextResponse.json({
                            success: errorOutput.length === 0,
                            command: command,
                            target: targetHost,
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
