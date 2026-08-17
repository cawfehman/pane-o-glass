import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");

        const where: any = {};
        if (status) {
            where.status = status;
        }

        const campaigns = await prisma.notificationCampaign.findMany({
            where,
            include: {
                template: {
                    select: { id: true, name: true, subject: true }
                },
                _count: {
                    select: { recipients: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(campaigns);
    } catch (err: any) {
        console.error("Failed to list campaigns:", err);
        return new NextResponse(err.message || "Failed to list campaigns", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const body = await req.json();
        const {
            id,
            name,
            breachName,
            templateId,
            sourceType = "HIBP_DOMAIN",
            sourceQuery,
            status: statusOverride, // Only allowed for STALLED → DRAFT reset
            recipients = [] // Array of { email, name, adName, accountStatus, breachName, breachDate, breachDetails, variablesJson }
        } = body;

        if (!name) {
            return new NextResponse("Campaign name is required", { status: 400 });
        }

        const username = session.user.name || (session.user as any)?.username || "User";
        const resolvedBreachName = breachName || recipients?.[0]?.breachName || sourceQuery || "Data Breach Incident";

        // If ID provided, update existing draft
        if (id) {
            const existing = await prisma.notificationCampaign.findUnique({ where: { id } });
            if (!existing) {
                return new NextResponse("Campaign not found", { status: 404 });
            }

            // Special path: reset STALLED → DRAFT so failed recipients can be retried
            if (statusOverride === "DRAFT" && existing.status === "STALLED") {
                await prisma.notificationCampaign.update({
                    where: { id },
                    data: { status: "DRAFT" }
                });
                // Reset FAILED recipients back to PENDING so dispatch can retry them
                await prisma.campaignRecipient.updateMany({
                    where: { campaignId: id, status: "FAILED" },
                    data: { status: "PENDING", errorMessage: null }
                });
                await logAudit(
                    "CAMPAIGN_RESET",
                    `Reset STALLED campaign "${name}" to DRAFT for retry by ${username}`,
                    (session.user as any)?.id || username
                );
                const reset = await prisma.notificationCampaign.findUnique({ where: { id }, include: { template: true } });
                return NextResponse.json(reset);
            }

            // Update basic info
            await prisma.notificationCampaign.update({
                where: { id },
                data: {
                    name,
                    breachName: resolvedBreachName,
                    templateId: templateId || null,
                    sourceType,
                    sourceQuery: sourceQuery || existing.sourceQuery,
                    totalCount: recipients.length > 0 ? recipients.length : existing.totalCount,
                }
            });

            // If new recipient list is passed, replace old recipients
            if (Array.isArray(recipients) && recipients.length > 0) {
                await prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
                await prisma.campaignRecipient.createMany({
                    data: recipients.map((r: any) => ({
                        campaignId: id,
                        email: r.email.toLowerCase().trim(),
                        name: r.name || "",
                        adName: r.adName || "",
                        accountStatus: r.accountStatus || "Active",
                        breachName: r.breachName || resolvedBreachName,
                        breachDate: r.breachDate || "",
                        breachDetails: r.breachDetails || "",
                        variablesJson: typeof r.variablesJson === "string" ? r.variablesJson : JSON.stringify(r.variablesJson || r),
                        status: "PENDING"
                    }))
                });
            }

            const updated = await prisma.notificationCampaign.findUnique({
                where: { id },
                include: { template: true }
            });

            await logAudit(
                "CAMPAIGN_UPDATED",
                `Updated notification campaign "${name}" (Breach: ${resolvedBreachName}, ${recipients.length > 0 ? recipients.length : existing.totalCount} recipients)`,
                (session.user as any)?.id || username
            );

            return NextResponse.json(updated);
        }

        // Create new campaign
        const campaign = await prisma.notificationCampaign.create({
            data: {
                name,
                breachName: resolvedBreachName,
                templateId: templateId || null,
                sourceType,
                sourceQuery: sourceQuery || "",
                status: "DRAFT",
                totalCount: recipients.length,
                createdById: username,
            }
        });

        // Insert recipients if provided
        if (Array.isArray(recipients) && recipients.length > 0) {
            await prisma.campaignRecipient.createMany({
                data: recipients.map((r: any) => ({
                    campaignId: campaign.id,
                    email: r.email.toLowerCase().trim(),
                    name: r.name || "",
                    adName: r.adName || "",
                    accountStatus: r.accountStatus || "Active",
                    breachName: r.breachName || resolvedBreachName,
                    breachDate: r.breachDate || "",
                    breachDetails: r.breachDetails || "",
                    variablesJson: typeof r.variablesJson === "string" ? r.variablesJson : JSON.stringify(r.variablesJson || r),
                    status: "PENDING"
                }))
            });
        }

        await logAudit("CAMPAIGN_CREATED", `Created notification campaign "${name}" with ${recipients.length} recipients`, (session.user as any)?.id);

        const fullCampaign = await prisma.notificationCampaign.findUnique({
            where: { id: campaign.id },
            include: { template: true }
        });

        return NextResponse.json(fullCampaign);
    } catch (err: any) {
        console.error("Failed to create/update campaign:", err);
        return new NextResponse(err.message || "Failed to save campaign", { status: 500 });
    }
}
