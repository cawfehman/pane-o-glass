"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import fs from "fs";
import path from "path";

function logInternalError(msg: string, err: any) {
    const logPath = path.join(process.cwd(), "error.log");
    const timestamp = new Date().toISOString();
    const content = `[${timestamp}] ${msg}: ${String(err)}\n${err?.stack || ""}\n\n`;
    fs.appendFileSync(logPath, content);
}

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
        logInternalError("Error fetching tool permissions", error);
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
        logInternalError("FATAL ERROR updating tool permission", error);
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
        logInternalError(`Error fetching permissions for role ${role}`, error);
        return [];
    }
}

export async function getPermissionsDiagnostic() {
    try {
        const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
        const absDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
        const exists = fs.existsSync(absDbPath);

        return {
            databaseUrl: process.env.DATABASE_URL,
            cwd: process.cwd(),
            absDbPath,
            dbFileExists: exists,
            allPermissions: await prisma.toolPermission.findMany(),
            users: await prisma.user.findMany({
                select: { username: true, role: true }
            }),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return { 
            error: String(error),
            stack: (error as any)?.stack,
            cwd: process.cwd(),
            env: process.env.DATABASE_URL
        };
    }
}

export async function getInternalLogs() {
    const logPath = path.join(process.cwd(), "error.log");
    if (!fs.existsSync(logPath)) return "No error log found.";
    try {
        const content = fs.readFileSync(logPath, "utf-8");
        return content.split("\n").slice(-100).join("\n");
    } catch (e) {
        return "Error reading log: " + String(e);
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
        logInternalError("Error resetting permissions", error);
        throw error;
    }
}
