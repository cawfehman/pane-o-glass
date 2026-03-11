import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const permitted = await hasPermission(role, 'firewall');

        console.log(`[API/Firewall/History] Request by ${session?.user?.name} (Role: ${role}). Permitted: ${permitted}`);

        if (!session?.user || !permitted) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
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
