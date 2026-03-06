import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // The /breaches endpoint does not technically require an API key, 
        // but we proxy it to avoid any browser CORS issues.
        const hibpUrl = `https://haveibeenpwned.com/api/v3/breaches`;
        const response = await fetch(hibpUrl, {
            headers: {
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
        console.error("[HIBP_ALL_BREACHES_ERROR]", error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
}
