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

            // Execute the command
            const result = await ssh.execCommand(command);

            // Disconnect immediately
            ssh.dispose();

            return NextResponse.json({
                success: true,
                command: command,
                target: targetHost,
                stdout: result.stdout,
                stderr: result.stderr
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
