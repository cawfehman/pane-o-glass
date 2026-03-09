"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getToolPermissions() {
    return await prisma.toolPermission.findMany({
        orderBy: [
            { toolId: 'asc' },
            { role: 'asc' }
        ]
    });
}

export async function updateToolPermission(toolId: string, role: string, isEnabled: boolean) {
    await prisma.toolPermission.upsert({
        where: {
            toolId_role: { toolId, role }
        },
        update: { isEnabled },
        create: { toolId, role, isEnabled }
    });
    
    revalidatePath("/");
    revalidatePath("/queries");
}

export async function getPermissionsForRole(role: string) {
    const permissions = await prisma.toolPermission.findMany({
        where: { role, isEnabled: true }
    });
    return permissions.map(p => p.toolId);
}
