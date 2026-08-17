import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { sendNotificationMail } from "@/lib/smtp";
import { renderMergedText, createSimulationBannerHtml, TemplateVariables } from "@/lib/templateParser";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { id } = await params;
        const body = await req.json().catch(() => ({}));
        const { recipientId, targetAdminEmail } = body;

        const campaign = await prisma.notificationCampaign.findUnique({
            where: { id },
            include: {
                template: true,
                recipients: true,
            }
        });

        if (!campaign) {
            return new NextResponse("Campaign not found", { status: 404 });
        }

        if (!campaign.template) {
            return new NextResponse("Please select or assign a template to this campaign before testing.", { status: 400 });
        }

        if (campaign.recipients.length === 0) {
            return new NextResponse("Campaign has no recipients staged.", { status: 400 });
        }

        // Pick specific recipient or random one
        let recipient = campaign.recipients[0];
        if (recipientId) {
            const found = campaign.recipients.find(r => r.id === recipientId);
            if (found) recipient = found;
        } else {
            const randomIndex = Math.floor(Math.random() * campaign.recipients.length);
            recipient = campaign.recipients[randomIndex];
        }

        // Determine destination admin email
        const userObj: any = session.user;
        let adminEmail = targetAdminEmail;
        if (!adminEmail) {
            adminEmail = userObj.email || (userObj.username ? `${userObj.username}@cooperhealth.edu` : "");
        }

        if (!adminEmail) {
            return new NextResponse("Unable to determine your destination admin email address. Please specify target email.", { status: 400 });
        }

        // Parse variables
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

        const renderedSubject = `[TEST] ${renderMergedText(campaign.template.subject, mergedVars)}`;
        const renderedBody = renderMergedText(campaign.template.bodyHtml, mergedVars);
        const simulationBanner = createSimulationBannerHtml(recipient.email, recipient.name || undefined);
        const finalHtml = `${simulationBanner}\n${renderedBody}`;

        const sendResult = await sendNotificationMail({
            to: adminEmail,
            subject: renderedSubject,
            html: finalHtml,
            text: renderMergedText(campaign.template.bodyText || "", mergedVars),
        });

        if (!sendResult.success) {
            return NextResponse.json({
                success: false,
                error: sendResult.error || "Failed to dispatch test email via SMTP."
            }, { status: 500 });
        }

        // Update tested recipient record
        await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
                status: "TEST_SENT",
                sentAt: new Date(),
                error: null,
            }
        });

        // Update campaign status
        await prisma.notificationCampaign.update({
            where: { id },
            data: {
                status: campaign.status === "DRAFT" ? "TEST_SENT" : campaign.status,
                testSentTo: adminEmail,
                testSentAt: new Date(),
            }
        });

        await logAudit("CAMPAIGN_TEST_SENT", `Dispatched test email for campaign "${campaign.name}" to ${adminEmail} (Simulating ${recipient.email})`, userObj.id);

        return NextResponse.json({
            success: true,
            message: `Test email successfully sent to ${adminEmail}`,
            simulatedRecipient: {
                email: recipient.email,
                name: recipient.name,
            },
            renderedSubject,
        });
    } catch (err: any) {
        console.error("Failed to send test email:", err);
        return new NextResponse(err.message || "Failed to send test email", { status: 500 });
    }
}
