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
        throw error; // Still throw for mutations to alert the UI
    }
}

export async function getPermissionsForRole(role: string) {
    noStore();
    try {
        const permissions = await prisma.toolPermission.findMany({
            where: { role, isEnabled: true }
        });
        return permissions.map((p: any) => p.toolId as string);
    } catch (error) {
        console.error(`Error fetching permissions for role ${role}:`, error);
        return [];
    }
}
