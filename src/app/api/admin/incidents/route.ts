import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const url = new URL(req.url);
        const search = url.searchParams.get("search")?.trim() || "";
        const severity = url.searchParams.get("severity")?.trim() || "";
        const status = url.searchParams.get("status")?.trim() || "";
        const category = url.searchParams.get("category")?.trim() || "";

        const where: any = {};

        if (severity && severity !== "ALL") {
            where.severity = severity;
        }
        if (status && status !== "ALL") {
            where.status = status;
        }
        if (category && category !== "ALL") {
            where.category = category;
        }
        if (search) {
            where.OR = [
                { incidentNumber: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { threatActor: { contains: search, mode: "insensitive" } },
                { attackVector: { contains: search, mode: "insensitive" } },
                { leadInvestigator: { contains: search, mode: "insensitive" } }
            ];
        }

        const incidents = await (prisma as any).incidentArchive.findMany({
            where,
            orderBy: { startedAt: "desc" },
            include: {
                _count: {
                    select: {
                        timeline: true,
                        evidence: true,
                        actions: true
                    }
                }
            }
        });

        // Compute summary metrics for header cards
        const allIncidents = await (prisma as any).incidentArchive.findMany({
            select: { severity: true, status: true, startedAt: true }
        });

        const metrics = {
            total: allIncidents.length,
            criticalHigh: allIncidents.filter((i: any) => i.severity === "CRITICAL" || i.severity === "HIGH").length,
            contained: allIncidents.filter((i: any) => i.status === "CONTAINED").length,
            closed: allIncidents.filter((i: any) => i.status === "CLOSED" || i.status === "ARCHIVED").length,
            investigating: allIncidents.filter((i: any) => i.status === "INVESTIGATING").length
        };

        return NextResponse.json({ incidents, metrics });
    } catch (error: any) {
        console.error("[Incident Archive GET] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to load incidents" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const body = await req.json();

        // Strict Sanitization Guardrail: Must be explicitly verified clean
        if (body.sanitized !== true) {
            return NextResponse.json({
                error: "Sanitization Guardrail: You must review and confirm that this incident contains NO passwords, hashes, PHI, or sensitive customer PII."
            }, { status: 400 });
        }

        if (!body.title || !body.startedAt || !body.executiveSummary) {
            return NextResponse.json({
                error: "Missing required fields: Title, Started Date, and Executive Summary are required."
            }, { status: 400 });
        }

        // Generate Incident Number if not provided (e.g. INC-2026-1001)
        let incidentNum = body.incidentNumber?.trim();
        if (!incidentNum) {
            const dateStr = new Date(body.startedAt).toISOString().slice(0, 7).replace("-", "");
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            incidentNum = `INC-${dateStr}-${randomSuffix}`;
        }

        // Format timeline items if provided
        const timelineData = Array.isArray(body.timeline) ? body.timeline.map((item: any) => ({
            timestamp: new Date(item.timestamp || Date.now()),
            title: item.title,
            description: item.description,
            source: item.source || null,
            isMilestone: Boolean(item.isMilestone),
            severity: item.severity || null
        })) : [];

        // Format evidence items if provided
        const evidenceData = Array.isArray(body.evidence) ? body.evidence.map((ev: any) => ({
            title: ev.title,
            description: ev.description || null,
            fileType: ev.fileType || "IMAGE",
            sourceVendor: ev.sourceVendor || null,
            dataUri: ev.dataUri || null,
            fileName: ev.fileName || null,
            fileSize: ev.fileSize || null
        })) : [];

        // Format action items if provided
        const actionData = Array.isArray(body.actions) ? body.actions.map((act: any) => ({
            action: act.action,
            owner: act.owner || null,
            status: act.status || "COMPLETED",
            category: act.category || "CONTAINMENT",
            completedAt: act.completedAt ? new Date(act.completedAt) : null
        })) : [];

        const created = await (prisma as any).incidentArchive.create({
            data: {
                incidentNumber: incidentNum,
                title: body.title,
                severity: body.severity || "HIGH",
                category: body.category || "BOTNET_BRUTE_FORCE",
                status: body.status || "CONTAINED",
                leadInvestigator: body.leadInvestigator || session?.user?.name || "Robert Rivera",
                threatActor: body.threatActor || null,
                attackVector: body.attackVector || null,
                impactedSystems: Array.isArray(body.impactedSystems) ? body.impactedSystems : [],
                startedAt: new Date(body.startedAt),
                containedAt: body.containedAt ? new Date(body.containedAt) : null,
                closedAt: body.closedAt ? new Date(body.closedAt) : null,
                executiveSummary: body.executiveSummary,
                rootCause: body.rootCause || null,
                impactAssessment: body.impactAssessment || null,
                metricsSummary: body.metricsSummary || {},
                indicators: body.indicators || [],
                sanitized: true,
                timeline: timelineData.length > 0 ? { create: timelineData } : undefined,
                evidence: evidenceData.length > 0 ? { create: evidenceData } : undefined,
                actions: actionData.length > 0 ? { create: actionData } : undefined
            },
            include: {
                timeline: true,
                evidence: true,
                actions: true
            }
        });

        // Audit Log entry
        await (prisma as any).auditLog.create({
            data: {
                userId: session?.user?.id || null,
                action: "INCIDENT_ARCHIVE_CREATE",
                details: `Created incident ${created.incidentNumber} ("${created.title}") - Severity: ${created.severity}`,
                ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1"
            }
        }).catch(() => {});

        return NextResponse.json({ success: true, incident: created });
    } catch (error: any) {
        console.error("[Incident Archive POST] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to create incident" }, { status: 500 });
    }
}
