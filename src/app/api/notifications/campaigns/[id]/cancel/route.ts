import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden: Access restricted.", { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();
        const reason = (body.reason || "").trim();

        if (!reason) {
            return new NextResponse("A valid cancellation reason is required.", { status: 400 });
        }

        const campaign = await prisma.notificationCampaign.findUnique({
            where: { id },
            select: { id: true, name: true, breachName: true, sourceQuery: true, status: true, totalCount: true, sentCount: true }
        });

        if (!campaign) {
            return new NextResponse("Campaign not found.", { status: 404 });
        }

        if (campaign.status === "COMPLETED" || campaign.status === "COMPLETED_WITH_ERRORS") {
            return new NextResponse("Completed campaigns cannot be cancelled.", { status: 400 });
        }

        const operatorName = session.user.name || (session.user as any)?.username || "User";
        const operatorId = (session.user as any)?.id || operatorName;
        const breachLabel = campaign.breachName || campaign.sourceQuery || "Incident";

        // Update campaign status to CANCELLED and record reason + operator metadata
        const updatedCampaign = await prisma.notificationCampaign.update({
            where: { id },
            data: {
                status: "CANCELLED",
                cancelReason: reason,
                cancelledById: operatorName,
                cancelledAt: new Date(),
            }
        });

        await logAudit(
            "CAMPAIGN_CANCELLED",
            `Cancelled campaign "${campaign.name}" (Breach: ${breachLabel}, Status prior: ${campaign.status}, Sent prior: ${campaign.sentCount}/${campaign.totalCount}). Reason: ${reason}`,
            operatorId
        );

        return NextResponse.json({
            success: true,
            message: `Campaign "${campaign.name}" has been cancelled/closed.`,
            campaign: updatedCampaign,
        });
    } catch (err: any) {
        console.error("Failed to cancel campaign:", err);
        return new NextResponse(err.message || "Failed to cancel campaign", { status: 500 });
    }
}
