import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let firewalls: any[] = [];
        try {
            firewalls = JSON.parse(configStr);
        } catch (e) {
            return NextResponse.json({
                error: "Invalid FIREWALL_CONFIG JSON format in .env file."
            }, { status: 500 });
        }

        if (!Array.isArray(firewalls) || firewalls.length === 0) {
            return NextResponse.json({
                error: "No firewalls configured. Please configure FIREWALL_CONFIG array in your .env file."
            }, { status: 500 });
        }

        const hosts = firewalls.map((fw: any) => ({
            id: fw.id,
            name: fw.name || fw.ip
        }));

        return NextResponse.json({ hosts });
    } catch (error) {
        console.error("Error fetching firewall hosts:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
