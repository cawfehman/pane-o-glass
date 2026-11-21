import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createApiKey, API_SCOPES, isApiGloballyEnabled, setApiGloballyEnabled } from "@/lib/api-keys";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/api-keys - List keys and available scopes
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        const userId = session?.user?.id;
        const isAdmin = role === "ADMIN";
        const hasAccess = isAdmin || (userId ? await hasPermission(role, "api-keys", userId) : false);

        if (!hasAccess) {
            return NextResponse.json({ error: "Access Denied: Missing api-keys permission." }, { status: 403 });
        }

        const whereClause = isAdmin ? {} : { userId };

        const [keys, apiGloballyEnabled] = await Promise.all([
            prisma.apiKey.findMany({
                where: whereClause,
                orderBy: { createdAt: "desc" },
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
                    createdBy: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            }),
            isApiGloballyEnabled()
        ]);

        return NextResponse.json({
            success: true,
            isAdmin,
            apiGloballyEnabled,
            availableScopes: API_SCOPES,
            keys
        });
    } catch (error: any) {
        console.error("Failed to list API keys:", error);
        return NextResponse.json({ error: error?.message || "Failed to retrieve API keys." }, { status: 500 });
    }
}

// POST /api/admin/api-keys - Issue a new API key
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        const userId = session?.user?.id;
        const isAdmin = role === "ADMIN";
        const hasAccess = isAdmin || (userId ? await hasPermission(role, "api-keys", userId) : false);

        if (!hasAccess) {
            return NextResponse.json({ error: "Access Denied: Missing api-keys permission." }, { status: 403 });
        }

        const body = await req.json();
        const { name, type, scopes, allowedIps, expiresInDays } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ error: "A valid name/label for the API Key is required." }, { status: 400 });
        }

        const validScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : ["intel:read"];
        // Non-admin users are strictly forced to PERSONAL tokens tied to their own account
        const keyType = isAdmin && type === "SERVICE" ? "SERVICE" : "PERSONAL";
        const targetUserId = keyType === "PERSONAL" ? (userId || session?.user?.id) : null;

        const creator = (session?.user?.email || session?.user?.name || "User") as string;

        const result = await createApiKey({
            name: name.trim(),
            type: keyType,
            scopes: validScopes,
            allowedIps: allowedIps || null,
            userId: targetUserId,
            createdBy: creator,
            expiresInDays: typeof expiresInDays === "number" && expiresInDays > 0 ? expiresInDays : null
        });

        await logAudit(
            "API_KEY_CREATED",
            `Created ${keyType} API key '${name}' with scopes [${validScopes.join(", ")}]${allowedIps ? ` (IP ACL: ${allowedIps})` : ""}`,
            creator,
            "dashboard"
        ).catch(() => {});

        return NextResponse.json({
            success: true,
            key: result // rawKey returned ONLY this once
        }, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create API key:", error);
        return NextResponse.json({ error: error?.message || "Failed to generate API key." }, { status: 500 });
    }
}

// PUT /api/admin/api-keys - Master toggle for global API access
export async function PUT(req: NextRequest) {
    try {
        const session = await auth();
        const role = String((session?.user as any)?.role || "").toUpperCase();
        if (role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Administrator role required." }, { status: 403 });
        }

        const body = await req.json();
        const { apiGloballyEnabled } = body;

        if (typeof apiGloballyEnabled !== "boolean") {
            return NextResponse.json({ error: "Missing or invalid 'apiGloballyEnabled' boolean flag." }, { status: 400 });
        }

        const creator = (session?.user?.email || session?.user?.name || "Administrator") as string;
        await setApiGloballyEnabled(apiGloballyEnabled, creator);

        await logAudit(
            "GLOBAL_API_TOGGLE",
            `Administrator ${creator} changed Global API Access state to ${apiGloballyEnabled ? "ENABLED" : "PAUSED"}`,
            creator,
            "dashboard"
        ).catch(() => {});

        return NextResponse.json({
            success: true,
            apiGloballyEnabled
        });
    } catch (error: any) {
        console.error("Failed to update global API access toggle:", error);
        return NextResponse.json({ error: error?.message || "Failed to update global API access." }, { status: 500 });
    }
}
