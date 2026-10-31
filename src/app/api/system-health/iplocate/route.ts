import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIpLocateCreditStatus } from "@/lib/iplocate-credits";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get("refresh") === "true";

        const info = await getIpLocateCreditStatus(forceRefresh);
        return NextResponse.json(info);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const info = await getIpLocateCreditStatus(true);
        return NextResponse.json(info);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
