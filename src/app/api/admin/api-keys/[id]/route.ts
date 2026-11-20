import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/api-keys/[id] - Toggle active or update IP ACL / scopes
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required." }, { status: 403 });
        }

        const { id } = await context.params;
        const body = await req.json();
        const { isActive, allowedIps, scopes, name } = body;

        const existing = await prisma.apiKey.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "API Key not found." }, { status: 404 });
        }

        const data: any = {};
        if (typeof isActive === "boolean") data.isActive = isActive;
        if (typeof allowedIps === "string" || allowedIps === null) data.allowedIps = allowedIps ? allowedIps.trim() : null;
        if (Array.isArray(scopes) && scopes.length > 0) data.scopes = scopes;
        if (typeof name === "string" && name.trim()) data.name = name.trim();

        const updated = await prisma.apiKey.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                type: true,
                keyPrefix: true,
                scopes: true,
                allowedIps: true,
                isActive: true,
                lastUsedAt: true,
                expiresAt: true,
                updatedAt: true
            }
        });

        const modifier = (session?.user?.email || session?.user?.name || "Administrator") as string;
        await logAudit(
            "API_KEY_UPDATED",
            `Updated API key '${updated.name}' (Active: ${updated.isActive})`,
            modifier,
            "dashboard"
        ).catch(() => {});

        return NextResponse.json({ success: true, key: updated });
    } catch (error: any) {
        console.error("Failed to update API key:", error);
        return NextResponse.json({ error: error?.message || "Failed to update API key." }, { status: 500 });
    }
}

// DELETE /api/admin/api-keys/[id] - Revoke & delete key
export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required." }, { status: 403 });
        }

        const { id } = await context.params;

        const existing = await prisma.apiKey.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "API Key not found." }, { status: 404 });
        }

        await prisma.apiKey.delete({ where: { id } });

        const modifier = (session?.user?.email || session?.user?.name || "Administrator") as string;
        await logAudit(
            "API_KEY_REVOKED",
            `Revoked and deleted API key '${existing.name}' (${existing.keyPrefix})`,
            modifier,
            "dashboard"
        ).catch(() => {});

        return NextResponse.json({ success: true, message: `API Key '${existing.name}' revoked.` });
    } catch (error: any) {
        console.error("Failed to delete API key:", error);
        return NextResponse.json({ error: error?.message || "Failed to revoke API key." }, { status: 500 });
    }
}
