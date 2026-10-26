import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const { id } = await context.params;

        const incident = await (prisma as any).incidentArchive.findFirst({
            where: {
                OR: [
                    { id: id },
                    { incidentNumber: id }
                ]
            },
            include: {
                timeline: {
                    orderBy: { timestamp: "asc" }
                },
                evidence: {
                    orderBy: { createdAt: "asc" }
                },
                actions: {
                    orderBy: { createdAt: "asc" }
                }
            }
        });

        if (!incident) {
            return NextResponse.json({ error: "Incident not found" }, { status: 404 });
        }

        return NextResponse.json({ incident });
    } catch (error: any) {
        console.error("[Incident Detail GET] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to load incident detail" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const { id } = await context.params;
        const body = await req.json();

        // Strict Sanitization Guardrail
        if (body.sanitized !== true) {
            return NextResponse.json({
                error: "Sanitization Guardrail: Incident must be verified clean of sensitive data."
            }, { status: 400 });
        }

        const updateData: any = {
            title: body.title,
            severity: body.severity,
            category: body.category,
            status: body.status,
            leadInvestigator: body.leadInvestigator,
            threatActor: body.threatActor,
            attackVector: body.attackVector,
            impactedSystems: Array.isArray(body.impactedSystems) ? body.impactedSystems : undefined,
            startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
            containedAt: body.containedAt ? new Date(body.containedAt) : null,
            closedAt: body.closedAt ? new Date(body.closedAt) : null,
            executiveSummary: body.executiveSummary,
            rootCause: body.rootCause,
            impactAssessment: body.impactAssessment,
            metricsSummary: body.metricsSummary,
            indicators: body.indicators,
            sanitized: true
        };

        // Clean out undefined
        Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

        // If timeline, evidence, or actions are passed, replace or append
        if (Array.isArray(body.timeline)) {
            // Replace timeline events
            await (prisma as any).incidentTimelineEvent.deleteMany({ where: { incidentId: id } });
            await (prisma as any).incidentTimelineEvent.createMany({
                data: body.timeline.map((item: any) => ({
                    incidentId: id,
                    timestamp: new Date(item.timestamp || Date.now()),
                    title: item.title,
                    description: item.description,
                    source: item.source || null,
                    isMilestone: Boolean(item.isMilestone),
                    severity: item.severity || null
                }))
            });
        }

        if (Array.isArray(body.actions)) {
            // Replace actions
            await (prisma as any).incidentActionItem.deleteMany({ where: { incidentId: id } });
            await (prisma as any).incidentActionItem.createMany({
                data: body.actions.map((act: any) => ({
                    incidentId: id,
                    action: act.action,
                    owner: act.owner || null,
                    status: act.status || "COMPLETED",
                    category: act.category || "CONTAINMENT",
                    completedAt: act.completedAt ? new Date(act.completedAt) : null
                }))
            });
        }

        const updated = await (prisma as any).incidentArchive.update({
            where: { id },
            data: updateData,
            include: {
                timeline: { orderBy: { timestamp: "asc" } },
                evidence: { orderBy: { createdAt: "asc" } },
                actions: { orderBy: { createdAt: "asc" } }
            }
        });

        // Audit Log
        await (prisma as any).auditLog.create({
            data: {
                userId: session?.user?.id || null,
                action: "INCIDENT_ARCHIVE_UPDATE",
                details: `Updated incident ${updated.incidentNumber} ("${updated.title}")`,
                ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1"
            }
        }).catch(() => {});

        return NextResponse.json({ success: true, incident: updated });
    } catch (error: any) {
        console.error("[Incident Detail PUT] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to update incident" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required" }, { status: 403 });
        }

        const { id } = await context.params;

        const deleted = await (prisma as any).incidentArchive.delete({
            where: { id }
        });

        // Audit Log
        await (prisma as any).auditLog.create({
            data: {
                userId: session?.user?.id || null,
                action: "INCIDENT_ARCHIVE_DELETE",
                details: `Deleted incident ${deleted.incidentNumber} ("${deleted.title}")`,
                ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1"
            }
        }).catch(() => {});

        return NextResponse.json({ success: true, deleted: deleted.incidentNumber });
    } catch (error: any) {
        console.error("[Incident Detail DELETE] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to delete incident" }, { status: 500 });
    }
}
