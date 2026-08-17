import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { id } = await params;

        const campaign = await prisma.notificationCampaign.findUnique({
            where: { id },
            include: {
                template: true,
                recipients: {
                    orderBy: { email: "asc" }
                },
                _count: {
                    select: { recipients: true }
                }
            }
        });

        if (!campaign) {
            return new NextResponse("Campaign not found", { status: 404 });
        }

        return NextResponse.json(campaign);
    } catch (err: any) {
        console.error("Failed to fetch campaign:", err);
        return new NextResponse(err.message || "Failed to fetch campaign", { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { id } = await params;

        const campaign = await prisma.notificationCampaign.findUnique({
            where: { id },
            select: { name: true, breachName: true, sourceQuery: true, totalCount: true, status: true }
        });

        if (!campaign) {
            return new NextResponse("Campaign not found", { status: 404 });
        }

        await prisma.notificationCampaign.delete({
            where: { id }
        });

        const userId = (session.user as any)?.id || session.user.name || "User";
        const breachLabel = campaign.breachName || campaign.sourceQuery || "Incident";
        await logAudit(
            "CAMPAIGN_DELETED",
            `Deleted notification campaign "${campaign.name}" (Breach: ${breachLabel}, ${campaign.totalCount} recipients, Status: ${campaign.status})`,
            userId
        );

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Failed to delete campaign:", err);
        return new NextResponse(err.message || "Failed to delete campaign", { status: 500 });
    }
}
