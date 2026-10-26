import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const existing = await (prisma as any).incidentArchive.findUnique({
            where: { incidentNumber: "INC-2026-0801" }
        });

        if (existing) {
            return NextResponse.json({ message: "Case INC-2026-0801 is already seeded", incident: existing });
        }

        const seeded = await (prisma as any).incidentArchive.create({
            data: {
                incidentNumber: "INC-2026-0801",
                title: "Distributed Residential Proxy Botnet & Credential Spray on Perimeter Gateways",
                severity: "CRITICAL",
                category: "BOTNET_BRUTE_FORCE",
                status: "CONTAINED",
                leadInvestigator: "Robert Rivera",
                threatActor: "Distributed Residential Proxy Syndicate / Underground Credential Stuffing Operation",
                attackVector: "Low-and-slow, high-velocity distributed password spray using non-reputable Tier-1 US Residential ISP exit nodes (Comcast, Spectrum, Verizon, AT&T). Each IP generated exactly 1 failure to evade classic velocity thresholds while rotating across corporate identities.",
                impactedSystems: [
                    "Cisco AnyConnect VPN (WDC-FTD Wilmington DC)",
                    "Cisco AnyConnect VPN (Kel-3140 Keleman DC)",
                    "Citrix NetScaler ADC Gateways (172.18.252.x / 172.18.253.x)",
                    "Active Directory Domain Services (Account Lockout Spike)"
                ],
                startedAt: new Date("2026-08-14T02:00:00Z"),
                containedAt: new Date("2026-10-26T06:00:00Z"),
                closedAt: null,
                executiveSummary: `Beginning mid-August 2026, Cooper University Health Care's perimeter ingress gateways (Cisco AnyConnect VPN and Citrix NetScaler ADC) experienced an advanced, persistent distributed authentication spray. Attackers utilized an extensive residential proxy network spanning over 80,000 distinct consumer IP addresses to execute low-and-slow brute force attempts across corporate employee usernames.\n\nTraditional perimeter defenses initially treated each IP as a single user error because 97% of IPs made only 1 attempt before rotating. Correlated telemetry in Pane-o-Glass revealed that the exact same employee identities were targeted seconds apart from different consumer ISPs across the country.\n\nContainment was achieved through the rapid development and deployment of three defensive layers:\n1. 4-Pillar Reputation Engine and 3-Strike Residential Strike Ledger isolating residential nodes from legitimate remote staff.\n2. Cisco Firepower Management Center (FMC) Security Intelligence dynamic blocklist enforcing Layer 3/4 edge shuns.\n3. NetScaler Login Triage and Citrix Guardian Shun Bridge dynamically mitigating the botnet's mid-October pivot to Citrix ADC.\n\nZero corporate accounts were breached, and internal clinical systems remained fully operational throughout the campaign.`,
                rootCause: "Publicly accessible authentication endpoints (Cisco AnyConnect AAA and Citrix NetScaler Gateway) exposed to Internet-wide distributed residential proxy services without edge-level ASN clustering or 3-strike cross-platform reputation enforcement.",
                impactAssessment: "No unauthorized access or data exfiltration occurred. Significant operational noise generated over 150,000 authentication failure syslog messages, intermittent Active Directory account lockouts for targeted staff, and elevated threat analysis overhead.",
                metricsSummary: {
                    totalFailedAttempts: 150174,
                    uniqueAttackerIps: 80255,
                    targetedAccounts: 1240,
                    blacklistedAsns: 12,
                    unauthorizedBreaches: 0,
                    reputationLedgerSize: 80255
                },
                indicators: [
                    { type: "ASN", value: "AS7922", notes: "Comcast Cable Communications - Heavily abused residential pool (38% of botnet volume)" },
                    { type: "ASN", value: "AS20115", notes: "Charter Communications / Spectrum - Residential proxy exit nodes" },
                    { type: "ASN", value: "AS701", notes: "Verizon Communications - Distributed residential spray nodes" },
                    { type: "ASN", value: "AS7018", notes: "AT&T Services - Residential proxy nodes" },
                    { type: "CIDR", value: "73.0.0.0/8", notes: "Comcast residential subnet cluster heavily represented in Graylog FTD drops" },
                    { type: "CIDR", value: "24.0.0.0/8", notes: "Charter/Spectrum consumer broadband subnet cluster" }
                ],
                sanitized: true,
                timeline: {
                    create: [
                        {
                            timestamp: new Date("2026-08-14T02:15:00Z"),
                            title: "Initial Velocity Anomaly Detected on Cisco AnyConnect",
                            description: "Graylog alerting noted an atypical baseline increase in %FTD-6-113015 and %FTD-6-113005 AAA failure events across Wilmington (WDC-FTD) and Keleman (Kel-3140) gateways.",
                            source: "Graylog",
                            isMilestone: true,
                            severity: "HIGH"
                        },
                        {
                            timestamp: new Date("2026-08-28T14:30:00Z"),
                            title: "Residential Proxy Architecture Identified",
                            description: "Sampling Graylog logs revealed 97.4% of attacking IPs produced exactly 1 failed login attempt before cycling. Reverse DNS and ASN queries proved IPs belonged to residential ISP accounts, indicating commercial proxy syndicates (e.g. BrightData/SmartProxy).",
                            source: "Internal Telemetry",
                            isMilestone: false,
                            severity: "HIGH"
                        },
                        {
                            timestamp: new Date("2026-09-15T09:00:00Z"),
                            title: "Engineering of FMC Security Intelligence Automation",
                            description: "Began engineering the Pane-o-Glass FMC Security Intelligence automated integration with a 3-Strike Reputation Ledger to bridge ASA Shun limits (max 5,000 active shuns) with FMC SI (unlimited capacity).",
                            source: "Pane-o-Glass",
                            isMilestone: true,
                            severity: "INFO"
                        },
                        {
                            timestamp: new Date("2026-10-18T11:20:00Z"),
                            title: "Botnet Pivot to Citrix NetScaler ADC",
                            description: "As AnyConnect defenses hardened, botnet controllers shifted traffic to Citrix Gateway (172.18.252.x). NetScaler Login Triage recorded a surge of ~74,000 authentication attempts against staff accounts.",
                            source: "NetScaler ADC",
                            isMilestone: true,
                            severity: "CRITICAL"
                        },
                        {
                            timestamp: new Date("2026-10-24T18:00:00Z"),
                            title: "Citrix Guardian & Dynamic Shun Bridge Deployed",
                            description: "Deployed automated citrix-guardian daemon and perimeter command queue runner. Over 9,500 Citrix attack IPs were ingested into the 3-Strike Reputation Ledger without incurring API credit costs.",
                            source: "Pane-o-Glass",
                            isMilestone: true,
                            severity: "HIGH"
                        },
                        {
                            timestamp: new Date("2026-10-26T06:00:00Z"),
                            title: "Attack Volume Collapsed & Incident Contained",
                            description: "Perimeter Security Telemetry Dashboard confirmed attack velocity dropped by 98.7%. 80,255 total attacking IPs quarantined or enforced. Zero unauthorized accounts breached.",
                            source: "Pane-o-Glass Telemetry",
                            isMilestone: true,
                            severity: "INFO"
                        }
                    ]
                },
                evidence: {
                    create: [
                        {
                            title: "Cisco FMC Security Intelligence Feed Configuration",
                            description: "Architecture schematic illustrating automated sync from PostgreSQL 3-Strike Ledger into Cisco FMC Network Object Lists.",
                            fileType: "REPORT",
                            sourceVendor: "Cisco FMC",
                            fileName: "fmc_si_feed_architecture.json"
                        },
                        {
                            title: "NetScaler Login Triage Syslog Double-Count Analysis",
                            description: "Technical forensic report identifying that ns_action: LOGIN_FAILED and ns_module: AAA Failed Policy dual-logged every NetScaler failure, clarifying the 150k headline volume into 74k discrete attempts.",
                            fileType: "LOG",
                            sourceVendor: "NetScaler ADC",
                            fileName: "netscaler_syslog_dual_log_triage.txt"
                        }
                    ]
                },
                actions: {
                    create: [
                        {
                            action: "Deploy 3-Strike Residential Strike Ledger to automatically quarantine rotating residential proxies.",
                            owner: "Robert Rivera",
                            status: "COMPLETED",
                            category: "CONTAINMENT",
                            completedAt: new Date("2026-10-20T12:00:00Z")
                        },
                        {
                            action: "Implement FMC Security Intelligence Feed endpoint (/api/feeds/security-intelligence) with automated 2-hour FMC download polling.",
                            owner: "Robert Rivera",
                            status: "COMPLETED",
                            category: "CONTAINMENT",
                            completedAt: new Date("2026-10-22T15:00:00Z")
                        },
                        {
                            action: "Develop Citrix Guardian daemon with dynamic SSH shun bridge to ASA/FTD firewalls.",
                            owner: "Robert Rivera",
                            status: "COMPLETED",
                            category: "CONTAINMENT",
                            completedAt: new Date("2026-10-24T18:00:00Z")
                        },
                        {
                            action: "Integrate Perimeter Telemetry Dashboard to monitor attack velocity split between AnyConnect, Citrix, and employee friction.",
                            owner: "Robert Rivera",
                            status: "COMPLETED",
                            category: "RECOVERY",
                            completedAt: new Date("2026-10-26T05:00:00Z")
                        },
                        {
                            action: "Sanitize all historical telemetry and ingest into Incident Archive Case INC-2026-0801.",
                            owner: "Robert Rivera",
                            status: "COMPLETED",
                            category: "LESSONS_LEARNED",
                            completedAt: new Date("2026-10-26T06:00:00Z")
                        }
                    ]
                }
            },
            include: {
                timeline: true,
                evidence: true,
                actions: true
            }
        });

        return NextResponse.json({ success: true, message: "Case INC-2026-0801 seeded successfully", incident: seeded });
    } catch (error: any) {
        console.error("[Incident Seed POST] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to seed incident" }, { status: 500 });
    }
}
