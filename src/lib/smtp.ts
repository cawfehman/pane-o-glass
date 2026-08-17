import nodemailer from "nodemailer";

export interface MailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
}

export function getSmtpTransporter() {
    const host = process.env.SMTP_HOST || "";
    const port = parseInt(process.env.SMTP_PORT || "25", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (!host) {
        return null;
    }

    const transportConfig: any = {
        host,
        port,
        secure,
        tls: {
            rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
        },
    };

    if (user && pass) {
        transportConfig.auth = { user, pass };
    }

    return nodemailer.createTransport(transportConfig);
}

export async function sendNotificationMail(options: MailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const transporter = getSmtpTransporter();
    const defaultFrom = process.env.SMTP_FROM || '"Information Security Alerts" <infosec-alerts@cooperhealth.edu>';
    const defaultReplyTo = process.env.SMTP_REPLY_TO || process.env.SMTP_FROM || 'security-helpdesk@cooperhealth.edu';

    const mailPayload = {
        from: options.from || defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>?/gm, ""), // Fallback plain text
        replyTo: options.replyTo || defaultReplyTo,
    };

    if (!transporter) {
        console.warn("[SMTP Mock] SMTP_HOST not configured in .env. Simulating email dispatch to:", options.to);
        return {
            success: true,
            messageId: `simulated-smtp-${Date.now()}`,
        };
    }

    try {
        const info = await transporter.sendMail(mailPayload);
        return {
            success: true,
            messageId: info.messageId,
        };
    } catch (err: any) {
        console.error("[SMTP Error] Failed to send email via relay:", err);
        return {
            success: false,
            error: err.message || "Failed to send email through SMTP relay.",
        };
    }
}

export async function testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
    const transporter = getSmtpTransporter();
    if (!transporter) {
        return { ok: false, message: "SMTP_HOST is not set in environment variables (.env)." };
    }
    try {
        await transporter.verify();
        return { ok: true, message: "SMTP relay connection verified successfully." };
    } catch (err: any) {
        return { ok: false, message: err.message || "Failed to verify SMTP connection." };
    }
}
