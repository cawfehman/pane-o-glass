import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const history = await prisma.firewallQueryHistory.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { username: true } }
            }
        });

        return NextResponse.json(history);
    } catch (e: any) {
        console.error("Failed to fetch firewall history:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
