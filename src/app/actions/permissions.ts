"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function getToolPermissions() {
    noStore();
    try {
        return await prisma.toolPermission.findMany({
            orderBy: [
                { toolId: 'asc' },
                { role: 'asc' }
            ]
        });
    } catch (error) {
        console.error("Error fetching tool permissions:", error);
        return [];
    }
}

export async function updateToolPermission(toolId: string, role: string, isEnabled: boolean) {
    console.log(`Updating permission: ${toolId} for ${role} to ${isEnabled}`);
    try {
        await prisma.toolPermission.upsert({
            where: {
                toolId_role: { toolId, role }
            },
            update: { isEnabled },
            create: { toolId, role, isEnabled }
        });
        
        console.log(`Successfully updated ${toolId} for ${role} to ${isEnabled}`);
        
        const session = await auth();
        await logAudit(
            "PERMISSION_CHANGE", 
            `Updated tool permission: ${toolId} for ${role} to ${isEnabled ? 'ENABLED' : 'DISABLED'}`,
            session?.user?.id
        );

        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users/permissions", "page");
    } catch (error) {
        console.error("FATAL ERROR updating tool permission:", error);
        throw error;
    }
}

export async function getPermissionsForRole(role: string) {
    noStore();
    try {
        const permissions = await prisma.toolPermission.findMany({
            where: { role: String(role).toUpperCase(), isEnabled: true }
        });
        return permissions.map((p: any) => p.toolId as string);
    } catch (error) {
        console.error(`Error fetching permissions for role ${role}:`, error);
        return [];
    }
}

export async function getPermissionsDiagnostic() {
    try {
        return {
            databaseUrl: process.env.DATABASE_URL,
            allPermissions: await prisma.toolPermission.findMany(),
            users: await prisma.user.findMany({
                select: { username: true, role: true }
            }),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return { error: String(error) };
    }
}

export async function resetPermissions() {
    const session = await auth();
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    try {
        await prisma.toolPermission.deleteMany({});

        const DEFAULT_PERMISSIONS = [
            { toolId: 'firewall', role: 'ADMIN', isEnabled: true },
            { toolId: 'ise', role: 'ADMIN', isEnabled: true },
            { toolId: 'ise-failures', role: 'ADMIN', isEnabled: true },
            { toolId: 'hibp-account', role: 'ADMIN', isEnabled: true },
            { toolId: 'hibp-domain', role: 'ADMIN', isEnabled: true },
            { toolId: 'firewall', role: 'ANALYST', isEnabled: true },
            { toolId: 'ise', role: 'ANALYST', isEnabled: true },
            { toolId: 'ise-failures', role: 'ANALYST', isEnabled: true },
            { toolId: 'hibp-account', role: 'ANALYST', isEnabled: true },
            { toolId: 'hibp-domain', role: 'ANALYST', isEnabled: false },
            { toolId: 'firewall', role: 'USER', isEnabled: false },
            { toolId: 'ise', role: 'USER', isEnabled: false },
            { toolId: 'ise-failures', role: 'USER', isEnabled: false },
            { toolId: 'hibp-account', role: 'USER', isEnabled: true },
            { toolId: 'hibp-domain', role: 'USER', isEnabled: false }
        ];

        for (const perm of DEFAULT_PERMISSIONS) {
            await prisma.toolPermission.create({ data: perm });
        }

        await logAudit("PERMISSION_RESET", "Admin reset all tool permissions to defaults", session?.user?.id);
        revalidatePath("/", "layout");
        return { success: true };
    } catch (error) {
        console.error("Error resetting permissions:", error);
        throw error;
    }
}
