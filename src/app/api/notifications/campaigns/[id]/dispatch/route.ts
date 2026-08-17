import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { sendNotificationMail } from "@/lib/smtp";
import { renderMergedText, TemplateVariables } from "@/lib/templateParser";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden: Access restricted.", { status: 403 });
        }

        const { id } = await params;

        const campaign = await prisma.notificationCampaign.findUnique({
            where: { id },
            include: {
                template: true,
                recipients: {
                    where: { status: { in: ["PENDING", "FAILED"] } }
                }
            }
        });

        if (!campaign) {
            return new NextResponse("Campaign not found", { status: 404 });
        }

        if (!campaign.template) {
            return new NextResponse("Campaign has no template assigned.", { status: 400 });
        }

        if (campaign.recipients.length === 0) {
            return new NextResponse("No pending recipients left to send in this campaign.", { status: 400 });
        }

        const username = session.user.name || (session.user as any)?.username || "User";

        // Update status to SENDING
        await prisma.notificationCampaign.update({
            where: { id },
            data: {
                status: "SENDING",
                approvedById: username,
                approvedAt: new Date(),
            }
        });

        // Background batch dispatcher execution
        // NOTE: Next.js serverless functions typically time out after 30–60s.
        // For large campaigns (>500 recipients at 40ms/each = ~20s), this should
        // complete in time. For very large campaigns, consider a dedicated queue.
        (async () => {
            let sent = 0;
            let failed = 0;

            for (const recipient of campaign.recipients) {
                let parsedVars: TemplateVariables = {};
                try {
                    if (recipient.variablesJson) {
                        parsedVars = JSON.parse(recipient.variablesJson);
                    }
                } catch (e) {}

                const mergedVars: TemplateVariables = {
                    Name: recipient.name || parsedVars.Name || parsedVars["First Last"] || recipient.email.split("@")[0],
                    Email: recipient.email,
                    BreachName: recipient.breachName || parsedVars["Breach Name"] || parsedVars.BreachName || campaign.sourceQuery || "Security Incident",
                    BreachDate: recipient.breachDate || parsedVars["Date of Breach"] || parsedVars.BreachDate || "Recent Incident",
                    BreachDetails: recipient.breachDetails || parsedVars["Breach Details"] || parsedVars.BreachDetails || "Credential compromise identified.",
                    ExposedCategories: parsedVars.ExposedCategories || parsedVars["Compromised Data"] || "Credentials, Email Addresses",
                    AccountStatus: recipient.accountStatus || parsedVars["Account Status"] || "Active",
                    ...parsedVars,
                };

                const renderedSubject = renderMergedText(campaign.template!.subject, mergedVars);
                const renderedHtml = renderMergedText(campaign.template!.bodyHtml, mergedVars);
                const renderedText = renderMergedText(campaign.template!.bodyText || "", mergedVars);

                const result = await sendNotificationMail({
                    to: recipient.email,
                    subject: renderedSubject,
                    html: renderedHtml,
                    text: renderedText,
                });

                if (result.success) {
                    sent++;
                    await prisma.campaignRecipient.update({
                        where: { id: recipient.id },
                        data: {
                            status: "SENT",
                            sentAt: new Date(),
                            errorMessage: null,
                        }
                    });
                } else {
                    failed++;
                    await prisma.campaignRecipient.update({
                        where: { id: recipient.id },
                        data: {
                            status: "FAILED",
                            errorMessage: result.error || "SMTP dispatch failed",
                        }
                    });
                }

                // Throttle 40ms to prevent connection flooding on corporate mail relays
                await new Promise((r) => setTimeout(r, 40));
            }

            const finalStatus = failed === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS";

            await prisma.notificationCampaign.update({
                where: { id },
                data: {
                    status: finalStatus,
                    sentCount: { increment: sent },
                    failedCount: { increment: failed },
                }
            });

            await logAudit("CAMPAIGN_DISPATCHED", `Completed dispatch for campaign "${campaign.name}": ${sent} sent, ${failed} failed.`, (session.user as any)?.id);
        })().catch(async (err) => {
            console.error("Async campaign dispatch crashed:", err);
            // Mark the campaign as STALLED so operators know it needs attention
            await prisma.notificationCampaign.update({
                where: { id },
                data: { status: "STALLED" }
            }).catch(() => {}); // Don't throw if this also fails
            await logAudit(
                "CAMPAIGN_DISPATCH_CRASHED",
                `Campaign "${campaign.name}" dispatch crashed mid-run: ${err?.message || "Unknown error"}. Campaign marked STALLED — retry failed recipients or contact an administrator.`,
                (session.user as any)?.id
            ).catch(() => {});
        });

        return NextResponse.json({
            success: true,
            message: `Campaign dispatch started for ${campaign.recipients.length} recipients.`,
            totalQueued: campaign.recipients.length
        });
    } catch (err: any) {
        console.error("Failed to start dispatch:", err);
        return new NextResponse(err.message || "Failed to start dispatch", { status: 500 });
    }
}
