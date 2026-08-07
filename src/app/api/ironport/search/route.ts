import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { OgGraylogClient } from "@/lib/og-graylog";

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ironport'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const body = await req.json();
        const { query, limit = 100, range = 86400 } = body;

        if (!query) {
            return new NextResponse("Missing query", { status: 400 });
        }

        const client = new OgGraylogClient();
        const messages = await client.searchMessages(query, limit, range);

        return NextResponse.json(messages);
    } catch (error: any) {
        console.error("IronPort Search API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch IronPort messages from Graylog", details: error.message },
            { status: 500 }
        );
    }
}
