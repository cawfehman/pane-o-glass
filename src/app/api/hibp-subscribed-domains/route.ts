import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const apiKey = process.env.HIBP_API_KEY;
        if (!apiKey) {
            return new NextResponse("HIBP API Key not configured on server", { status: 500 });
        }

        const hibpUrl = `https://haveibeenpwned.com/api/v3/subscribeddomains`;
        const response = await fetch(hibpUrl, {
            headers: {
                "hibp-api-key": apiKey,
                "user-agent": "LinuxDash-QueryTool",
            },
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`HIBP API Error: ${response.status} - ${message}`);
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[HIBP_SUBSCRIBED_DOMAINS_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
