import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
    try {
        const session = await auth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const hostsStr = process.env.FIREWALL_HOSTS || "";
        // Support comma separated list of IPs/Hostnames
        const hosts = hostsStr.split(",").map(h => h.trim()).filter(h => h.length > 0);

        if (hosts.length === 0) {
            return NextResponse.json({
                error: "No firewalls configured. Please add FIREWALL_HOSTS to your .env file."
            }, { status: 500 });
        }

        return NextResponse.json({ hosts });
    } catch (error) {
        console.error("Error fetching firewall hosts:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
