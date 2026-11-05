import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { logAudit } from "@/lib/audit";
import { stripDomainSuffix } from "@/lib/netscaler-login-triage";
import type { CitrixIpEvaluation } from "@/lib/netscaler-login-triage";
import { CITRIX_LOGIN_ADVISORY_TEMPLATE } from "@/app/api/notifications/templates/route";
import { renderMergedText } from "@/lib/templateParser";

export interface ExtractedAnomaly {
    anomalyKey: string;
    ip: string;
    flagReason: string;
    triggerSignals: string[];
    suggestedTag: string | null;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    currentDecision: "BLOCKED" | "ALLOWED";
    decisionDetails: string;
    ispOrg: string;
    asn: string;
    cityName: string;
    countryCode: string;
    isResidential: boolean;
    anchorUsername: string | null;
    anchorDisplayName: string | null;
    anchorDepartment: string | null;
    targetedUsers: string[];
    variantStrings: string[];
    failureCount: number;
    citrixSuccesses: number;
    hasPriorVpn: boolean;
    firstSeen: Date;
    lastSeen: Date;
}

/**
 * Evaluates an IP's Citrix telemetry to extract objective anomalies warranting
 * SOC analyst review without investigator bias.
 */
export function extractAnomaliesFromEvaluations(
    evaluations: CitrixIpEvaluation[]
): ExtractedAnomaly[] {
    const anomalies: ExtractedAnomaly[] = [];

    for (const ev of evaluations) {
        const users = ev.targetedUsers || [];
        if (users.length === 0) continue;

        // Check for verified corporate anchor account
        const anchorUsers = users.filter(
            (u) =>
                (u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" || u.adStatus === "LOCKED") &&
                u.isCorporateFormat
        );
        const primaryAnchor = anchorUsers[0] || null;

        // Identify signals
        const numericBadgeAttempts = users
            .filter((u) => /^\d{4,8}$/.test(stripDomainSuffix(u.username)))
            .map((u) => u.username);

        const typoUsers = users.filter((u) => u.isTypoOfAnchor).map((u) => u.username);

        const userStrings = users.map((u) => u.username.toLowerCase());
        const canonicalSet = new Set(userStrings.map(stripDomainSuffix));
        const hasDomainDuplicate = canonicalSet.size < userStrings.length;
        const domainVariants = users
            .filter((u) => u.username.includes("@") && !typoUsers.includes(u.username))
            .map((u) => u.username);

        const hasMfaPushTimeouts = ev.imprivataMfaTimeoutCount > 0 && ev.imprivataBadPasswordCount === 0;

        const isBlockedDecision =
            ev.isOnGuardianBlacklist ||
            ev.isCurrentlyShunned ||
            ev.verdict === "ABUSIVE_BLOCK";

        const currentDecision: "BLOCKED" | "ALLOWED" = isBlockedDecision ? "BLOCKED" : "ALLOWED";
        let decisionDetails = isBlockedDecision
            ? `Blocked: ${ev.isOnGuardianBlacklist ? "On Guardian Blacklist" : ""}${ev.isCurrentlyShunned ? " • ASA Shun Active" : ""} (${ev.verdictReason || "Abusive Rule Trigger"})`
            : `Allowed: ${ev.protectionNote || "Safety Shield Active (Prior Authentication History)"}`;

        const allVariants = Array.from(new Set([...numericBadgeAttempts, ...typoUsers, ...domainVariants]));

        // Anomaly Pattern 1: Employee Badge ID entered alongside verified anchor
        if (numericBadgeAttempts.length > 0 && primaryAnchor) {
            anomalies.push({
                anomalyKey: `${ev.ip}-BADGE_ID`,
                ip: ev.ip,
                flagReason: `Source IP attempted valid corporate user '${primaryAnchor.username}' alongside numeric employee badge string (${numericBadgeAttempts.join(", ")}). Recorded ${ev.totalFailures} failures.`,
                triggerSignals: ["BADGE_NUMERIC_ID", "VALID_ANCHOR_PRESENT", ev.maxAuthFailuresIn10m >= 3 ? "AUTH_BURST_10M" : "INTERMITTENT_FAILURES"],
                suggestedTag: "Possible Employee Badge Entry",
                severity: "LOW",
                currentDecision,
                decisionDetails,
                ispOrg: ev.companyName || "Unknown ISP",
                asn: ev.asn || "N/A",
                cityName: ev.cityName || "US",
                countryCode: ev.countryCode || "US",
                isResidential: ev.isResidentialIsp,
                anchorUsername: primaryAnchor.username,
                anchorDisplayName: primaryAnchor.adDisplayName || null,
                anchorDepartment: primaryAnchor.adDepartment || null,
                targetedUsers: userStrings,
                variantStrings: allVariants,
                failureCount: ev.totalFailures,
                citrixSuccesses: ev.citrixSuccessCount,
                hasPriorVpn: ev.hasVpnSuccessHistory,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
            continue;
        }

        // Anomaly Pattern 2: Multi-User Clinic / Hotspot location
        const distinctValidAd = anchorUsers.length;
        if (distinctValidAd >= 2 && ev.isResidentialIsp) {
            const depts = Array.from(new Set(anchorUsers.map((u) => u.adDepartment).filter(Boolean)));
            const sameDept = depts.length === 1;
            anomalies.push({
                anomalyKey: `${ev.ip}-CLINIC_CLUSTER`,
                ip: ev.ip,
                flagReason: `Residential/Mobile connection attempted by ${distinctValidAd} verified corporate users (${anchorUsers.map((u) => u.username).join(", ")})${sameDept ? ` sharing department '${depts[0]}'` : ""}. Total failures: ${ev.totalFailures}.`,
                triggerSignals: ["MULTI_USER_CLUSTER", sameDept ? "SHARED_DEPARTMENT" : "MULTI_DEPARTMENT", ev.hasVpnSuccessHistory || ev.citrixSuccessCount > 0 ? "VERIFIED_LOCATION_HISTORY" : "UNVERIFIED_LOCATION"],
                suggestedTag: sameDept ? "Shared Department / Satellite Clinic Location" : "Multi-User Residential Hotspot",
                severity: "MEDIUM",
                currentDecision,
                decisionDetails,
                ispOrg: ev.companyName || "Unknown ISP",
                asn: ev.asn || "N/A",
                cityName: ev.cityName || "US",
                countryCode: ev.countryCode || "US",
                isResidential: ev.isResidentialIsp,
                anchorUsername: primaryAnchor?.username || null,
                anchorDisplayName: primaryAnchor?.adDisplayName || null,
                anchorDepartment: primaryAnchor?.adDepartment || null,
                targetedUsers: userStrings,
                variantStrings: allVariants,
                failureCount: ev.totalFailures,
                citrixSuccesses: ev.citrixSuccessCount,
                hasPriorVpn: ev.hasVpnSuccessHistory,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
            continue;
        }

        // Anomaly Pattern 3: Typo / Delimiter Mismatch on Active Corporate Account
        if ((typoUsers.length > 0 || hasDomainDuplicate) && primaryAnchor) {
            anomalies.push({
                anomalyKey: `${ev.ip}-TYPO_DELIMITER`,
                ip: ev.ip,
                flagReason: `Delimiter syntax mismatch or character typo (${allVariants.join(", ")}) attempted against active corporate user '${primaryAnchor.username}' from ${ev.companyName || "remote ISP"}.`,
                triggerSignals: ["DELIMITER_OR_TYPO", "VALID_ANCHOR_PRESENT"],
                suggestedTag: "Corporate Account Typo / Delimiter Variation",
                severity: "LOW",
                currentDecision,
                decisionDetails,
                ispOrg: ev.companyName || "Unknown ISP",
                asn: ev.asn || "N/A",
                cityName: ev.cityName || "US",
                countryCode: ev.countryCode || "US",
                isResidential: ev.isResidentialIsp,
                anchorUsername: primaryAnchor.username,
                anchorDisplayName: primaryAnchor.adDisplayName || null,
                anchorDepartment: primaryAnchor.adDepartment || null,
                targetedUsers: userStrings,
                variantStrings: allVariants,
                failureCount: ev.totalFailures,
                citrixSuccesses: ev.citrixSuccessCount,
                hasPriorVpn: ev.hasVpnSuccessHistory,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
            continue;
        }

        // Anomaly Pattern 4: Imprivata Confirm ID MFA Push Expirations (Password OK)
        if (hasMfaPushTimeouts && primaryAnchor) {
            anomalies.push({
                anomalyKey: `${ev.ip}-MFA_TIMEOUT`,
                ip: ev.ip,
                flagReason: `Imprivata RADIUS confirmed AD password was valid for '${primaryAnchor.username}', but ${ev.imprivataMfaTimeoutCount} smartphone Confirm ID push verification(s) timed out without approval.`,
                triggerSignals: ["MFA_PUSH_TIMEOUT", "PASSWORD_CORRECT", "VALID_ANCHOR_PRESENT"],
                suggestedTag: "Imprivata Confirm ID MFA Push Timeout",
                severity: "MEDIUM",
                currentDecision,
                decisionDetails,
                ispOrg: ev.companyName || "Unknown ISP",
                asn: ev.asn || "N/A",
                cityName: ev.cityName || "US",
                countryCode: ev.countryCode || "US",
                isResidential: ev.isResidentialIsp,
                anchorUsername: primaryAnchor.username,
                anchorDisplayName: primaryAnchor.adDisplayName || null,
                anchorDepartment: primaryAnchor.adDepartment || null,
                targetedUsers: userStrings,
                variantStrings: allVariants,
                failureCount: ev.totalFailures,
                citrixSuccesses: ev.citrixSuccessCount,
                hasPriorVpn: ev.hasVpnSuccessHistory,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
            continue;
        }

        // Anomaly Pattern 5: Automated Block on Corporate Employee with Mitigating Factors
        const hasMitigations = ev.citrixSuccessCount > 0 || ev.hasVpnSuccessHistory || primaryAnchor !== null;
        if (isBlockedDecision && hasMitigations) {
            anomalies.push({
                anomalyKey: `${ev.ip}-MITIGATED_BLOCK`,
                ip: ev.ip,
                flagReason: `Automated perimeter block active (${decisionDetails}) on connection with verified corporate employee '${primaryAnchor?.username || "AD User"}' and ${ev.citrixSuccessCount} prior successful logins.`,
                triggerSignals: ["ACTIVE_PERIMETER_BLOCK", "PRIOR_AUTHENTICATION_SUCCESS", "VALID_ANCHOR_PRESENT"],
                suggestedTag: "Automated Block on Verified Corporate Employee",
                severity: "HIGH",
                currentDecision,
                decisionDetails,
                ispOrg: ev.companyName || "Unknown ISP",
                asn: ev.asn || "N/A",
                cityName: ev.cityName || "US",
                countryCode: ev.countryCode || "US",
                isResidential: ev.isResidentialIsp,
                anchorUsername: primaryAnchor?.username || null,
                anchorDisplayName: primaryAnchor?.adDisplayName || null,
                anchorDepartment: primaryAnchor?.adDepartment || null,
                targetedUsers: userStrings,
                variantStrings: allVariants,
                failureCount: ev.totalFailures,
                citrixSuccesses: ev.citrixSuccessCount,
                hasPriorVpn: ev.hasVpnSuccessHistory,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
        }
    }

    return anomalies;
}

/**
 * Persists detected anomalies into the PostgreSQL database while preserving
 * analyst review notes, acknowledgment statuses, and timestamps.
 */
export async function syncAnomaliesToDatabase(
    evaluations: CitrixIpEvaluation[]
): Promise<number> {
    const extracted = extractAnomaliesFromEvaluations(evaluations);
    if (extracted.length === 0) return 0;

    let upsertCount = 0;
    for (const an of extracted) {
        await prisma.citrixLoginAnomaly.upsert({
            where: { anomalyKey: an.anomalyKey },
            update: {
                currentDecision: an.currentDecision,
                decisionDetails: an.decisionDetails,
                flagReason: an.flagReason,
                triggerSignals: an.triggerSignals,
                suggestedTag: an.suggestedTag,
                severity: an.severity,
                failureCount: an.failureCount,
                citrixSuccesses: an.citrixSuccesses,
                hasPriorVpn: an.hasPriorVpn,
                lastSeen: new Date(),
                targetedUsers: an.targetedUsers,
                variantStrings: an.variantStrings
            },
            create: {
                anomalyKey: an.anomalyKey,
                ip: an.ip,
                flagReason: an.flagReason,
                triggerSignals: an.triggerSignals,
                suggestedTag: an.suggestedTag,
                severity: an.severity,
                status: "PENDING_REVIEW",
                currentDecision: an.currentDecision,
                decisionDetails: an.decisionDetails,
                ispOrg: an.ispOrg,
                asn: an.asn,
                cityName: an.cityName,
                countryCode: an.countryCode,
                isResidential: an.isResidential,
                anchorUsername: an.anchorUsername,
                anchorDisplayName: an.anchorDisplayName,
                anchorDepartment: an.anchorDepartment,
                targetedUsers: an.targetedUsers,
                variantStrings: an.variantStrings,
                failureCount: an.failureCount,
                citrixSuccesses: an.citrixSuccesses,
                hasPriorVpn: an.hasPriorVpn,
                firstSeen: an.firstSeen,
                lastSeen: an.lastSeen
            }
        }).catch((err) => {
            console.error(`[AnomalyEngine] Failed to upsert anomaly ${an.anomalyKey}:`, err.message);
        });
        upsertCount++;
    }

    return upsertCount;
}

/**
 * Dispatches a generic, professional Cooper University Health Care remote access
 * login guidance notification directly to the impacted employee's email via SMTP.
 */
export async function dispatchOneClickAdvisory(
    anomalyId: string,
    analystUser: string
): Promise<{ success: boolean; recipient: string; subject: string; messageId?: string }> {
    const anomaly = await prisma.citrixLoginAnomaly.findUnique({
        where: { id: anomalyId }
    });

    if (!anomaly || !anomaly.anchorUsername) {
        throw new Error("Anomaly record or valid corporate username not found.");
    }

    const cleanUsername = stripDomainSuffix(anomaly.anchorUsername).toLowerCase();
    const recipientEmail = `${cleanUsername}@cooperhealth.edu`;
    const recipientName = anomaly.anchorDisplayName || cleanUsername;

    const template = CITRIX_LOGIN_ADVISORY_TEMPLATE;

    const variables = {
        Name: recipientName,
        Email: recipientEmail,
        Username: cleanUsername,
        CurrentDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };

    const renderedHtml = renderMergedText(template.bodyHtml, variables);
    const renderedText = renderMergedText(template.bodyText || "", variables);

    const smtpHost = process.env.SMTP_HOST || "mail.cooperhealth.edu";
    const smtpPort = parseInt(process.env.SMTP_PORT || "25", 10);
    const smtpFrom = process.env.SMTP_FROM || `"Information Security Alerts" <infosec@cooperhealth.edu>`;

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        tls: { rejectUnauthorized: false }
    });

    const info = await transporter.sendMail({
        from: smtpFrom,
        to: recipientEmail,
        subject: template.subject,
        html: renderedHtml,
        text: renderedText,
    });

    const now = new Date();
    await prisma.citrixLoginAnomaly.update({
        where: { id: anomalyId },
        data: {
            notifiedAt: now,
            notifiedBy: analystUser,
            analystNotes: anomaly.analystNotes
                ? `${anomaly.analystNotes}\n[${now.toISOString()}] 1-Click Advisory sent to ${recipientEmail} by ${analystUser}`
                : `[${now.toISOString()}] 1-Click Advisory sent to ${recipientEmail} by ${analystUser}`
        }
    });

    await logAudit(
        "CITRIX_ANOMALY_USER_NOTIFIED",
        `Sent Citrix Gateway Remote Access Advisory to ${recipientEmail} for anomaly on IP ${anomaly.ip}. Initiated by ${analystUser}.`,
        analystUser,
        anomaly.ip
    );

    return {
        success: true,
        recipient: recipientEmail,
        subject: template.subject,
        messageId: info.messageId
    };
}
