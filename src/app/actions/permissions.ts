"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import fs from "fs";
import path from "path";

export async function logSystemEvent(msg: string) {
    const logPath = path.join(process.cwd(), "system.log");
    const timestamp = new Date().toISOString();
    const content = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(logPath, content);
    } catch (e) {
        console.error("Failed to write to system log:", e);
    }
}

function logInternalError(msg: string, err: any) {
    const logPath = path.join(process.cwd(), "error.log");
    const timestamp = new Date().toISOString();
    const content = `[${timestamp}] ${msg}: ${String(err)}\n${err?.stack || ""}\n\n`;
    fs.appendFileSync(logPath, content);
    // Also mirror to system log for easier viewing
    logSystemEvent(`ERROR: ${msg}: ${String(err)}`);
}

async function ensureAdmin() {
    const session = await auth();
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error("Unauthorized: Administrator access required.");
    }
    return session;
}

export async function getToolPermissions() {
    noStore();
    await ensureAdmin();
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
    const session = await ensureAdmin();
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

export async function hasPermission(role: string, toolId: string) {
    if (role === 'ADMIN') return true;
    noStore();
    try {
        const permission = await prisma.toolPermission.findFirst({
            where: { 
                role: String(role).toUpperCase(), 
                toolId: (toolId === 'ise-failures' || toolId === 'ise-tacacs') ? 'ise' : toolId, 
                isEnabled: true 
            }
        });
        return !!permission;
    } catch (error) {
        logInternalError(`Error checking permission ${toolId} for role ${role}`, error);
        return false;
    }
}

export async function getPermissionsDiagnostic() {
    await ensureAdmin();
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
    await ensureAdmin();
    const errorLogPath = path.join(process.cwd(), "error.log");
    const systemLogPath = path.join(process.cwd(), "system.log");
    
    let combinedLogs = "";
    
    if (fs.existsSync(systemLogPath)) {
        combinedLogs += "--- SYSTEM LOGS ---\n";
        combinedLogs += fs.readFileSync(systemLogPath, "utf-8").split("\n").slice(-100).join("\n");
        combinedLogs += "\n\n";
    }
    
    if (fs.existsSync(errorLogPath)) {
        combinedLogs += "--- ERROR LOGS ---\n";
        combinedLogs += fs.readFileSync(errorLogPath, "utf-8").split("\n").slice(-100).join("\n");
    }

    return combinedLogs || "No logs found.";
}

export async function resetPermissions() {
    const session = await ensureAdmin();

    try {
        await prisma.toolPermission.deleteMany({});

        const DEFAULT_PERMISSIONS = [
            { toolId: 'firewall', role: 'ADMIN', isEnabled: true },
            { toolId: 'ise', role: 'ADMIN', isEnabled: true },
            { toolId: 'ise-tacacs', role: 'ADMIN', isEnabled: true },
            { toolId: 'hibp-account', role: 'ADMIN', isEnabled: true },
            { toolId: 'hibp-domain', role: 'ADMIN', isEnabled: true },
            { toolId: 'firewall', role: 'ANALYST', isEnabled: true },
            { toolId: 'ise', role: 'ANALYST', isEnabled: true },
            { toolId: 'ise-tacacs', role: 'ANALYST', isEnabled: true },
            { toolId: 'hibp-account', role: 'ANALYST', isEnabled: true },
            { toolId: 'hibp-domain', role: 'ANALYST', isEnabled: false },
            { toolId: 'firewall', role: 'USER', isEnabled: false },
            { toolId: 'ise', role: 'USER', isEnabled: false },
            { toolId: 'ise-tacacs', role: 'USER', isEnabled: false },
            { toolId: 'hibp-account', role: 'USER', isEnabled: true },
            { toolId: 'hibp-domain', role: 'USER', isEnabled: false },
            { toolId: 'firewall', role: 'NETWORK', isEnabled: true },
            { toolId: 'ise', role: 'NETWORK', isEnabled: true },
            { toolId: 'ise-tacacs', role: 'NETWORK', isEnabled: true },
            { toolId: 'hibp-account', role: 'NETWORK', isEnabled: true },
            { toolId: 'hibp-domain', role: 'NETWORK', isEnabled: false },
            { toolId: 'vectra', role: 'ADMIN', isEnabled: true },
            { toolId: 'vectra', role: 'ANALYST', isEnabled: true },
            { toolId: 'vectra', role: 'DESKTOP', isEnabled: true },
            { toolId: 'vectra', role: 'NETWORK', isEnabled: false },
            { toolId: 'vectra', role: 'USER', isEnabled: false },
            { toolId: 'firewall', role: 'DESKTOP', isEnabled: true },
            { toolId: 'ise', role: 'DESKTOP', isEnabled: false },
            { toolId: 'ise-tacacs', role: 'DESKTOP', isEnabled: false },
            { toolId: 'hibp-account', role: 'DESKTOP', isEnabled: true },
            { toolId: 'hibp-domain', role: 'DESKTOP', isEnabled: false }
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
