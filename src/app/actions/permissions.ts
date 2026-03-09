"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getToolPermissions() {
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
    try {
        await prisma.toolPermission.upsert({
            where: {
                toolId_role: { toolId, role }
            },
            update: { isEnabled },
            create: { toolId, role, isEnabled }
        });
        
        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users/permissions", "page");
    } catch (error) {
        console.error("Error updating tool permission:", error);
        throw error; // Still throw for mutations to alert the UI
    }
}

export async function getPermissionsForRole(role: string) {
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
