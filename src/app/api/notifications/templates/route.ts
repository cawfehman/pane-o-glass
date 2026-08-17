import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

const SEED_TEMPLATES = [
    {
        name: "Standard Credential Breach Notice",
        description: "Official security notification alerting the user their corporate email address was identified in a verified data breach.",
        category: "BREACH",
        subject: "Security Notification: Action Required Regarding Data Breach ({{BreachName}})",
        bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 0.05em;">Information Security Advisory</h2>
    </div>
    <div style="padding: 24px;">
        <p>Dear {{Name}},</p>
        <p>Our security monitoring systems have detected that your corporate email address (<strong>{{Email}}</strong>) was included in a known third-party security incident involving <strong>{{BreachName}}</strong>.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; margin: 20px 0; border-radius: 0 6px 6px 0;">
            <p style="margin: 0 0 6px 0;"><strong>Incident:</strong> {{BreachName}}</p>
            <p style="margin: 0 0 6px 0;"><strong>Incident Date:</strong> {{BreachDate}}</p>
            <p style="margin: 0 0 6px 0;"><strong>Compromised Categories:</strong> {{ExposedCategories}}</p>
            <p style="margin: 0;"><strong>Details:</strong> {{BreachDetails}}</p>
        </div>

        <h3 style="color: #0f172a; font-size: 16px; margin-top: 24px;">Recommended Next Steps:</h3>
        <ul style="padding-left: 20px;">
            <li>If you used your corporate password on this third-party service, please change your Active Directory password immediately.</li>
            <li>Ensure you are not reusing your corporate password across any personal accounts or external websites.</li>
            <li>Be vigilant for unexpected phishing emails or multi-factor authentication (MFA) prompts.</li>
        </ul>

        <p style="margin-top: 24px;">If you have any questions or require assistance, please contact the Information Security Helpdesk.</p>
        <p style="margin-bottom: 0;">Sincerely,<br><strong>Information Security Team</strong></p>
    </div>
    <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
        This is an automated security advisory from Cooper University Health Care Information Security.
    </div>
</div>`,
    },
    {
        name: "Urgent Password Reset Directive",
        description: "High-priority notice for critical breaches where cleartext or unsalted passwords were leaked.",
        category: "SECURITY_ALERT",
        subject: "URGENT ACTION REQUIRED: Mandatory Password Reset for {{Email}}",
        bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #fecdd3; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #be123c; padding: 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 0.05em;">⚠️ Mandatory Security Directive</h2>
    </div>
    <div style="padding: 24px;">
        <p>Dear {{Name}},</p>
        <p style="color: #9f1239; font-weight: bold;">Your corporate credentials were confirmed to be exposed in a critical data breach ({{BreachName}}).</p>
        
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0 0 6px 0;"><strong>Incident Source:</strong> {{BreachName}}</p>
            <p style="margin: 0 0 6px 0;"><strong>Compromised Data:</strong> {{ExposedCategories}}</p>
            <p style="margin: 0;"><strong>Recorded Breach Date:</strong> {{BreachDate}}</p>
        </div>

        <p>Because passwords or authentication tokens were exposed, you must reset your password as soon as possible:</p>
        <ol style="padding-left: 20px;">
            <li>Press <strong>Ctrl + Alt + Delete</strong> on your corporate workstation and select <em>Change a password</em>, or visit the self-service portal.</li>
            <li>Create a new unique password that meets our corporate complexity requirements.</li>
            <li>Never disclose your credentials or MFA approval codes to anyone.</li>
        </ol>

        <p style="margin-top: 24px;">Thank you for your prompt cooperation in safeguarding our organization's systems.</p>
        <p style="margin-bottom: 0;"><strong>Information Security Operations</strong></p>
    </div>
</div>`,
    },
    {
        name: "Financial & Identity Compromise Notice",
        description: "Targeted alert for breaches containing sensitive financial data, SSNs, or payment card records.",
        category: "BREACH",
        subject: "Security Alert: Sensitive Data Exposure Notice ({{BreachName}})",
        bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #fed7aa; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #c2410c; padding: 24px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 0.05em;">Security & Identity Alert</h2>
    </div>
    <div style="padding: 24px;">
        <p>Dear {{Name}},</p>
        <p>We are notifying you that your details associated with <strong>{{Email}}</strong> were identified in a high-risk breach of <strong>{{BreachName}}</strong> that exposed sensitive identity or financial records.</p>
        
        <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px 18px; margin: 20px 0; border-radius: 0 6px 6px 0;">
            <p style="margin: 0 0 6px 0;"><strong>Exposed Categories:</strong> {{ExposedCategories}}</p>
            <p style="margin: 0;"><strong>Incident Date:</strong> {{BreachDate}}</p>
        </div>

        <p>We strongly recommend monitoring your financial statements and credit reports for any suspicious activity, and taking advantage of credit monitoring services if applicable.</p>
        <p style="margin-bottom: 0;">Sincerely,<br><strong>Corporate Information Security</strong></p>
    </div>
</div>`,
    }
];

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        let templates = await prisma.notificationTemplate.findMany({
            orderBy: { createdAt: "desc" }
        });

        // Seed initial templates if empty
        if (templates.length === 0) {
            const username = session.user.name || (session.user as any)?.username || "System";
            for (const seed of SEED_TEMPLATES) {
                await prisma.notificationTemplate.create({
                    data: {
                        ...seed,
                        createdBy: username,
                    }
                });
            }
            templates = await prisma.notificationTemplate.findMany({
                orderBy: { createdAt: "desc" }
            });
        }

        return NextResponse.json(templates);
    } catch (err: any) {
        console.error("Failed to list templates:", err);
        return new NextResponse(err.message || "Failed to list templates", { status: 500 });
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
        const { name, description, category, subject, bodyHtml, bodyText } = body;

        if (!name || !subject || !bodyHtml) {
            return new NextResponse("Name, Subject, and Email Body are required.", { status: 400 });
        }

        const username = session.user.name || (session.user as any)?.username || "User";

        const template = await prisma.notificationTemplate.create({
            data: {
                name,
                description: description || "",
                category: category || "BREACH",
                subject,
                bodyHtml,
                bodyText: bodyText || "",
                createdBy: username,
            }
        });

        return NextResponse.json(template);
    } catch (err: any) {
        console.error("Failed to create template:", err);
        return new NextResponse(err.message || "Failed to create template", { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const body = await req.json();
        const { id, name, description, category, subject, bodyHtml, bodyText } = body;

        if (!id) {
            return new NextResponse("Template ID is required", { status: 400 });
        }

        const updated = await prisma.notificationTemplate.update({
            where: { id },
            data: {
                name,
                description,
                category,
                subject,
                bodyHtml,
                bodyText,
            }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        console.error("Failed to update template:", err);
        return new NextResponse(err.message || "Failed to update template", { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return new NextResponse("Template ID is required", { status: 400 });
        }

        await prisma.notificationTemplate.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Failed to delete template:", err);
        return new NextResponse(err.message || "Failed to delete template", { status: 500 });
    }
}
