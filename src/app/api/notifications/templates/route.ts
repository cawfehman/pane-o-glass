import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

const PRIMARY_COOPER_TEMPLATE = {
    name: "Corporate Email Exposure Advisory",
    description: "Official Cooper University Health Care security notification informing staff their corporate email address was identified in a third-party breach.",
    category: "BREACH",
    subject: "Notification Regarding Your Corporate Email Address",
    isEnabled: true,
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
    <!-- Cooper Header Banner with Brand Red Accent (Pantone 193 / RGB: 195, 0, 47) -->
    <div style="background-color: #0f172a; padding: 22px 28px; text-align: left; border-bottom: 4px solid #C3002F;">
        <h2 style="color: #ffffff; margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.02em;">Cooper University Health Care</h2>
        <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 13px;">Information Security Advisory</p>
    </div>
    <div style="padding: 28px;">
        <p style="margin-top: 0; font-size: 15px;">Hello {{Name}},</p>
        
        <p style="font-size: 14px;">We are reaching out to inform you that Cooper University Health Care has received notification from a trusted third-party source indicating that your email address (<strong>{{Email}}</strong>) was identified among information exposed in a data breach involving an external organization or service (<strong>{{BreachName}}</strong>).</p>

        <!-- Breach Incident Callout with Cooper Red Accent -->
        <div style="background-color: #fdf2f4; border-left: 4px solid #C3002F; padding: 14px 18px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 13px;">
            <p style="margin: 0 0 4px 0; color: #1e293b;"><strong>Incident Source:</strong> {{BreachName}}</p>
            <p style="margin: 0 0 4px 0; color: #1e293b;"><strong>Recorded Breach Date:</strong> {{BreachDate}}</p>
            <p style="margin: 0; color: #1e293b;"><strong>Compromised Categories:</strong> {{ExposedCategories}}</p>
        </div>

        <p style="font-size: 14px;">At this time, there is no indication that Cooper systems were involved in this incident. This notification is being provided as a precaution so that you are aware of the exposure and can take appropriate steps to protect any accounts that may be associated with the affected email address.</p>

        <p style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">As a best practice, we recommend that you:</p>
        <ul style="margin-top: 0; padding-left: 22px; font-size: 14px;">
            <li style="margin-bottom: 6px;">Change passwords for any external accounts that may have been affected.</li>
            <li style="margin-bottom: 6px;">Ensure unique passwords are used across different services.</li>
            <li style="margin-bottom: 6px;">Enable Multi-Factor Authentication (MFA) where available.</li>
            <li style="margin-bottom: 6px;">Remain alert for phishing emails or other suspicious communications.</li>
        </ul>

        <p style="font-size: 14px;">Please note that the exposure occurred outside of Cooper's environment. We are sharing this information to help you take proactive measures to protect your personal and professional accounts.</p>

        <!-- Information Security Contact Callout -->
        <p style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #9f1239; margin: 22px 0;">
            If you have any questions, please contact Information Security @ <a href="mailto:infosec@cooperhealth.edu" style="color: #C3002F; font-weight: 700; text-decoration: underline;">infosec@cooperhealth.edu</a>.
        </p>

        <p style="margin-top: 24px; margin-bottom: 0; font-size: 14px;">Thank you,</p>
        <p style="margin-top: 4px; margin-bottom: 0; font-weight: 700; color: #0f172a; font-size: 14px;">
            Information Security<br>
            <span style="font-weight: 500; color: #475569;">Cooper University Health Care</span>
        </p>
    </div>
    <div style="background-color: #f8fafc; padding: 14px 28px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        This is an official communication from Cooper University Health Care Information Security.
    </div>
</div>`,
    bodyText: `Hello {{Name}},

We are reaching out to inform you that Cooper University Health Care has received notification from a trusted third-party source indicating that your email address ({{Email}}) was identified among information exposed in a data breach involving an external organization or service ({{BreachName}}).

At this time, there is no indication that Cooper systems were involved in this incident. This notification is being provided as a precaution so that you are aware of the exposure and can take appropriate steps to protect any accounts that may be associated with the affected email address.

As a best practice, we recommend that you:
- Change passwords for any external accounts that may have been affected.
- Ensure unique passwords are used across different services.
- Enable Multi-Factor Authentication (MFA) where available.
- Remain alert for phishing emails or other suspicious communications.

Please note that the exposure occurred outside of Cooper's environment. We are sharing this information to help you take proactive measures to protect your personal and professional accounts.

If you have any questions, please contact Information Security @ infosec@cooperhealth.edu.

Thank you,

Information Security
Cooper University Health Care`
};

const LEGACY_SEED_TEMPLATES = [
    {
        name: "Standard Credential Breach Notice (Archived)",
        description: "Legacy generic breach notice. (Disabled)",
        category: "BREACH",
        subject: "Security Notification: Action Required Regarding Data Breach ({{BreachName}})",
        isEnabled: false,
        bodyHtml: `<div>Legacy template archived.</div>`,
    },
    {
        name: "Urgent Password Reset Directive (Archived)",
        description: "Legacy password reset notice. (Disabled)",
        category: "SECURITY_ALERT",
        subject: "URGENT ACTION REQUIRED: Mandatory Password Reset for {{Email}}",
        isEnabled: false,
        bodyHtml: `<div>Legacy template archived.</div>`,
    },
    {
        name: "Financial & Identity Compromise Notice (Archived)",
        description: "Legacy financial alert notice. (Disabled)",
        category: "BREACH",
        subject: "Security Alert: Sensitive Data Exposure Notice ({{BreachName}})",
        isEnabled: false,
        bodyHtml: `<div>Legacy template archived.</div>`,
    }
];

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (!session?.user || !(await hasPermission(role, 'notification-center'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const activeOnly = searchParams.get("activeOnly") === "true";

        // Upsert primary Cooper template
        await prisma.notificationTemplate.upsert({
            where: { name: PRIMARY_COOPER_TEMPLATE.name },
            update: {
                description: PRIMARY_COOPER_TEMPLATE.description,
                category: PRIMARY_COOPER_TEMPLATE.category,
                subject: PRIMARY_COOPER_TEMPLATE.subject,
                bodyHtml: PRIMARY_COOPER_TEMPLATE.bodyHtml,
                bodyText: PRIMARY_COOPER_TEMPLATE.bodyText,
                isEnabled: true,
            },
            create: {
                ...PRIMARY_COOPER_TEMPLATE,
                createdBy: "Information Security",
            }
        });

        const where: any = {};
        if (activeOnly) {
            where.isEnabled = true;
        }

        const templates = await prisma.notificationTemplate.findMany({
            where,
            orderBy: [
                { isEnabled: "desc" },
                { createdAt: "desc" }
            ]
        });

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
        const { name, description, category, subject, bodyHtml, bodyText, isEnabled = true } = body;

        if (!name || !subject || !bodyHtml) {
            return new NextResponse("Name, Subject, and Email Body are required.", { status: 400 });
        }

        const username = (session.user as any)?.username || session.user.name || "User";

        const template = await prisma.notificationTemplate.create({
            data: {
                name,
                description: description || "",
                category: category || "BREACH",
                subject,
                bodyHtml,
                bodyText: bodyText || "",
                isEnabled: isEnabled !== false,
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
        const { id, name, description, category, subject, bodyHtml, bodyText, isEnabled } = body;

        if (!id) {
            return new NextResponse("Template ID is required", { status: 400 });
        }

        const existing = await prisma.notificationTemplate.findUnique({
            where: { id }
        });

        if (!existing) {
            return new NextResponse("Template not found", { status: 404 });
        }

        const currentUsername = String((session.user as any)?.username || "").toLowerCase();
        const currentName = String(session.user.name || "").toLowerCase();
        const creator = String(existing.createdBy || "").toLowerCase();

        const isAdmin = role === "ADMIN";
        const isOwner = creator === currentUsername || creator === currentName || creator === "user";

        // Enforce immutability check
        if (!isAdmin && !isOwner) {
            return new NextResponse(
                `Forbidden: Only the template creator (${existing.createdBy}) or an Administrator can edit this template. Please duplicate/clone this template to make your own changes.`,
                { status: 403 }
            );
        }

        const updated = await prisma.notificationTemplate.update({
            where: { id },
            data: {
                name: name ?? existing.name,
                description: description ?? existing.description,
                category: category ?? existing.category,
                subject: subject ?? existing.subject,
                bodyHtml: bodyHtml ?? existing.bodyHtml,
                bodyText: bodyText ?? existing.bodyText,
                isEnabled: typeof isEnabled === "boolean" ? isEnabled : existing.isEnabled,
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

        const existing = await prisma.notificationTemplate.findUnique({
            where: { id }
        });

        if (!existing) {
            return new NextResponse("Template not found", { status: 404 });
        }

        const currentUsername = String((session.user as any)?.username || "").toLowerCase();
        const currentName = String(session.user.name || "").toLowerCase();
        const creator = String(existing.createdBy || "").toLowerCase();

        const isAdmin = role === "ADMIN";
        const isOwner = creator === currentUsername || creator === currentName || creator === "user";

        if (!isAdmin && !isOwner) {
            return new NextResponse(
                `Forbidden: Only the template creator (${existing.createdBy}) or an Administrator can delete this template.`,
                { status: 403 }
            );
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
