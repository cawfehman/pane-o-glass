import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const blacklist = await prisma.guardianBlacklist.findMany({
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(blacklist);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to load Guardian blacklist" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const ip = searchParams.get("ip")?.trim();

        if (!ip) {
            return NextResponse.json({ error: "Missing ip parameter" }, { status: 400 });
        }

        await prisma.guardianBlacklist.delete({
            where: { ip }
        });

        await logAudit(
            "GUARDIAN_BLACKLIST_CLEAR",
            `Manually removed IP ${ip} from Guardian do-not-unshun blacklist`,
            session.user?.id,
            "internal"
        );

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to clear IP from blacklist" }, { status: 500 });
    }
}
