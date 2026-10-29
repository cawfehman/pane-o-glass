"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { SYSTEM_DEFAULT_PERMISSIONS_MAP } from "@/lib/permissions-constants";
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



export async function getResolvedRoleDefaults(): Promise<{
    defaults: Record<string, Record<string, boolean>>;
    isCustomized: boolean;
    customCount: number;
}> {
    try {
        const customDefaults = await prisma.roleDefaultPermission.findMany();
        const map: Record<string, Record<string, boolean>> = {};
        
        for (const [toolId, roleMap] of Object.entries(SYSTEM_DEFAULT_PERMISSIONS_MAP)) {
            map[toolId] = { ...roleMap };
        }

        for (const d of customDefaults) {
            if (!map[d.toolId]) map[d.toolId] = {};
            map[d.toolId][d.role] = d.isEnabled;
        }

        return {
            defaults: map,
            isCustomized: customDefaults.length > 0,
            customCount: customDefaults.length,
        };
    } catch (e) {
        logInternalError("Error resolving role defaults", e);
        return {
            defaults: SYSTEM_DEFAULT_PERMISSIONS_MAP,
            isCustomized: false,
            customCount: 0,
        };
    }
}

export async function getRoleDefaultPermissions() {
    noStore();
    await ensureAdmin();
    return await getResolvedRoleDefaults();
}

export async function updateRoleDefaultPermission(toolId: string, role: string, isEnabled: boolean) {
    const session = await ensureAdmin();
    const roleUpper = String(role).toUpperCase();
    try {
        await prisma.roleDefaultPermission.upsert({
            where: {
                toolId_role: { toolId, role: roleUpper }
            },
            update: { isEnabled },
            create: { toolId, role: roleUpper, isEnabled }
        });

        await logAudit(
            "ROLE_DEFAULT_PERMISSION_CHANGE",
            `Updated system role default for tool '${toolId}' on role '${roleUpper}' to ${isEnabled ? 'ENABLED' : 'DISABLED'}`,
            session?.user?.id
        );

        revalidatePath("/", "layout");
        revalidatePath("/users/permissions", "page");
        return { success: true };
    } catch (error) {
        logInternalError("Error updating role default permission", error);
        throw error;
    }
}

export async function saveAllRoleDefaultPermissions(
    defaults: Record<string, Record<string, boolean>>,
    applyToActive: boolean = false
) {
    const session = await ensureAdmin();
    try {
        let updateCount = 0;
        for (const [toolId, roleMap] of Object.entries(defaults)) {
            for (const [role, isEnabled] of Object.entries(roleMap)) {
                const roleUpper = role.toUpperCase();
                await prisma.roleDefaultPermission.upsert({
                    where: { toolId_role: { toolId, role: roleUpper } },
                    update: { isEnabled },
                    create: { toolId, role: roleUpper, isEnabled }
                });
                updateCount++;

                if (applyToActive) {
                    await prisma.toolPermission.upsert({
                        where: { toolId_role: { toolId, role: roleUpper } },
                        update: { isEnabled },
                        create: { toolId, role: roleUpper, isEnabled }
                    });
                }
            }
        }

        const auditMsg = `Saved ${updateCount} system role defaults in database${applyToActive ? ' (and synchronized active permissions)' : ''}`;
        await logAudit("ROLE_DEFAULTS_UPDATE", auditMsg, session?.user?.id);

        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users/permissions", "page");
        return { success: true, count: updateCount };
    } catch (error) {
        logInternalError("Error saving all role default permissions", error);
        throw error;
    }
}

export async function saveCurrentAsRoleDefaults() {
    const session = await ensureAdmin();
    try {
        const activePermissions = await prisma.toolPermission.findMany();
        const activeMap: Record<string, Record<string, boolean>> = {};
        for (const p of activePermissions) {
            if (!activeMap[p.toolId]) activeMap[p.toolId] = {};
            activeMap[p.toolId][p.role] = p.isEnabled;
        }

        const merged: Record<string, Record<string, boolean>> = {};
        for (const [toolId, roleMap] of Object.entries(SYSTEM_DEFAULT_PERMISSIONS_MAP)) {
            merged[toolId] = { ...roleMap };
        }
        for (const [toolId, roleMap] of Object.entries(activeMap)) {
            if (!merged[toolId]) merged[toolId] = {};
            for (const [role, isEnabled] of Object.entries(roleMap)) {
                merged[toolId][role] = isEnabled;
            }
        }

        let count = 0;
        for (const [toolId, roleMap] of Object.entries(merged)) {
            for (const [role, isEnabled] of Object.entries(roleMap)) {
                await prisma.roleDefaultPermission.upsert({
                    where: { toolId_role: { toolId, role: role.toUpperCase() } },
                    update: { isEnabled },
                    create: { toolId, role: role.toUpperCase(), isEnabled }
                });
                count++;
            }
        }

        await logAudit(
            "ROLE_DEFAULTS_UPDATE",
            `Promoted current active tool permissions (${count} tool/role cells) as authoritative system role defaults`,
            session?.user?.id
        );

        revalidatePath("/", "layout");
        revalidatePath("/users/permissions", "page");
        return { success: true, count };
    } catch (error) {
        logInternalError("Error promoting active permissions as defaults", error);
        throw error;
    }
}

export async function resetRoleDefaultsToFactory() {
    const session = await ensureAdmin();
    try {
        const deleted = await prisma.roleDefaultPermission.deleteMany({});
        await logAudit(
            "ROLE_DEFAULTS_FACTORY_RESET",
            `Reverted system role defaults back to factory baseline (${deleted.count} custom default records deleted)`,
            session?.user?.id
        );

        revalidatePath("/", "layout");
        revalidatePath("/users/permissions", "page");
        return { success: true, count: deleted.count };
    } catch (error) {
        logInternalError("Error resetting role defaults to factory", error);
        throw error;
    }
}

export async function getPermissionsForRole(role: string) {
    noStore();
    try {
        const roleUpper = String(role).toUpperCase();
        const permissions = await prisma.toolPermission.findMany({
            where: { role: roleUpper }
        });

        const configured = new Map<string, boolean>();
        for (const p of permissions) {
            configured.set(p.toolId, p.isEnabled);
        }

        const { defaults } = await getResolvedRoleDefaults();
        const allowedTools = new Set<string>();

        for (const [toolId, roleMap] of Object.entries(defaults)) {
            if (configured.has(toolId)) {
                if (configured.get(toolId)) allowedTools.add(toolId);
            } else {
                if (roleMap[roleUpper]) allowedTools.add(toolId);
            }
        }

        // Additional legacy tool fallbacks if needed
        if ((roleUpper === 'ADMIN' || roleUpper === 'ANALYST') && !configured.has('graylog-exporter')) {
            allowedTools.add('graylog-exporter');
        }
        if ((roleUpper === 'ADMIN' || roleUpper === 'ANALYST' || roleUpper === 'NETWORK') && !configured.has('vpn-s2s')) {
            allowedTools.add('vpn-s2s');
        }
        if (roleUpper !== 'USER' && !configured.has('account-lockout')) {
            allowedTools.add('account-lockout');
        }
        if ((roleUpper === 'USER' || roleUpper === 'IAM') && !configured.has('hibp-account')) {
            allowedTools.add('hibp-account');
        }
        if ((roleUpper === 'ADMIN' || roleUpper === 'NETWORK') && !configured.has('meraki')) {
            allowedTools.add('meraki');
        }

        return Array.from(allowedTools);
    } catch (error) {
        logInternalError(`Error fetching permissions for role ${role}`, error);
        return [];
    }
}

export async function getEffectivePermissions(userId?: string | null, role?: string | null): Promise<string[]> {
    noStore();
    try {
        let resolvedUserId = userId;
        let resolvedRole = role;
        if (!resolvedUserId || !resolvedRole) {
            try {
                const session = await auth();
                if (!resolvedUserId) resolvedUserId = session?.user?.id;
                if (!resolvedRole) resolvedRole = (session?.user as any)?.role;
            } catch {}
        }

        const roleUpper = String(resolvedRole || 'USER').toUpperCase();
        const baseRolePerms = await getPermissionsForRole(roleUpper);

        if (!resolvedUserId) {
            return baseRolePerms;
        }

        const overrides = await prisma.userToolOverride.findMany({
            where: { userId: resolvedUserId }
        });

        if (overrides.length === 0) {
            return baseRolePerms;
        }

        const grants = overrides.filter(o => o.isEnabled).map(o => o.toolId);
        const denys = new Set(overrides.filter(o => !o.isEnabled).map(o => o.toolId));

        const effective = new Set([...baseRolePerms, ...grants]);
        for (const deniedTool of denys) {
            effective.delete(deniedTool);
        }

        return Array.from(effective);
    } catch (error) {
        logInternalError(`Error calculating effective permissions for user ${userId} (role: ${role})`, error);
        return getPermissionsForRole(role || 'USER');
    }
}

export async function hasPermission(role: string, toolId: string, userId?: string | null) {
    const roleUpper = String(role || '').toUpperCase();
    if (roleUpper === 'ADMIN') return true;
    try {
        try { noStore(); } catch {}

        // Resolve userId from active session if not explicitly provided
        let resolvedUserId = userId;
        if (!resolvedUserId) {
            try {
                const session = await auth();
                resolvedUserId = session?.user?.id;
            } catch {}
        }

        const checkIds = [toolId];
        if (toolId === 'ise-tacacs' || toolId === 'ise-failures') checkIds.push('ise');
        if (toolId === 'etd' || toolId === 'bec') checkIds.push('ironport');

        // Check user-specific override first if resolvedUserId is available
        if (resolvedUserId) {
            for (const tid of checkIds) {
                const userOverride = await prisma.userToolOverride.findUnique({
                    where: {
                        userId_toolId: { userId: resolvedUserId, toolId: tid }
                    }
                });
                if (userOverride !== null && userOverride !== undefined) {
                    return userOverride.isEnabled;
                }
            }
        }

        for (const tid of checkIds) {
            const permission = await prisma.toolPermission.findFirst({
                where: {
                    role: roleUpper,
                    toolId: tid,
                }
            });
            if (permission !== null) {
                return permission.isEnabled;
            }
        }

        // Check RoleDefaultPermission
        for (const tid of checkIds) {
            const customDefault = await prisma.roleDefaultPermission.findUnique({
                where: {
                    toolId_role: { toolId: tid, role: roleUpper }
                }
            });
            if (customDefault !== null) {
                return customDefault.isEnabled;
            }
        }

        // Fallback to SYSTEM_DEFAULT_PERMISSIONS_MAP
        for (const tid of checkIds) {
            if (SYSTEM_DEFAULT_PERMISSIONS_MAP[tid]?.[roleUpper] !== undefined) {
                return SYSTEM_DEFAULT_PERMISSIONS_MAP[tid][roleUpper];
            }
        }

        // Hard-coded legacy fallbacks
        if (toolId === 'graylog-exporter' && (roleUpper === 'ADMIN' || roleUpper === 'ANALYST')) return true;
        if (toolId === 'vpn-s2s' && (roleUpper === 'ADMIN' || roleUpper === 'ANALYST' || roleUpper === 'NETWORK')) return true;
        if (toolId === 'account-lockout' && roleUpper !== 'USER') return true;
        if (toolId === 'hibp-account' && (roleUpper === 'IAM' || roleUpper === 'USER')) return true;
        if (toolId === 'meraki' && (roleUpper === 'ADMIN' || roleUpper === 'NETWORK')) return true;

        return false;
    } catch (error) {
        logInternalError(`Error checking permission ${toolId} for role ${role}`, error);
        return false;
    }
}

export async function getUserToolOverrides(targetUserId: string) {
    noStore();
    await ensureAdmin();
    try {
        const overrides = await prisma.userToolOverride.findMany({
            where: { userId: targetUserId }
        });
        return overrides;
    } catch (error) {
        logInternalError(`Error fetching tool overrides for user ${targetUserId}`, error);
        return [];
    }
}

export async function updateUserToolOverride(targetUserId: string, toolId: string, isEnabled: boolean | null) {
    const session = await ensureAdmin();
    try {
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { username: true, role: true }
        });

        if (isEnabled === null) {
            await prisma.userToolOverride.deleteMany({
                where: { userId: targetUserId, toolId }
            });
            await logAudit(
                "USER_PERMISSION_OVERRIDE",
                `Removed tool override for '${toolId}' on user '${targetUser?.username}' (reverted to role inheritance)`,
                session?.user?.id
            );
        } else {
            await prisma.userToolOverride.upsert({
                where: {
                    userId_toolId: { userId: targetUserId, toolId }
                },
                update: { isEnabled },
                create: { userId: targetUserId, toolId, isEnabled }
            });
            await logAudit(
                "USER_PERMISSION_OVERRIDE",
                `Set tool override for '${toolId}' on user '${targetUser?.username}' to ${isEnabled ? 'GRANTED (Enhanced Access)' : 'DENIED'}`,
                session?.user?.id
            );
        }

        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users", "page");
        return { success: true };
    } catch (error) {
        logInternalError(`Error updating tool override for user ${targetUserId} tool ${toolId}`, error);
        throw error;
    }
}

export async function saveAllUserToolOverrides(
    targetUserId: string, 
    overrides: Record<string, boolean | null>
) {
    const session = await ensureAdmin();
    try {
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { username: true, role: true }
        });

        // Fetch currently existing overrides for this user
        const existingOverrides = await prisma.userToolOverride.findMany({
            where: { userId: targetUserId }
        });

        const changes: string[] = [];
        const desiredToolIds = new Set(
            Object.keys(overrides).filter(t => overrides[t] === true || overrides[t] === false)
        );

        // 1. Delete any existing database overrides that are not in desiredToolIds or set to null
        const toDelete = existingOverrides.filter(e => !desiredToolIds.has(e.toolId) || overrides[e.toolId] === null);
        if (toDelete.length > 0) {
            await prisma.userToolOverride.deleteMany({
                where: {
                    userId: targetUserId,
                    toolId: { in: toDelete.map(d => d.toolId) }
                }
            });
            for (const d of toDelete) {
                changes.push(`${d.toolId}: REVERTED_TO_INHERIT`);
            }
        }

        // 2. Upsert active overrides (true or false)
        for (const [toolId, state] of Object.entries(overrides)) {
            if (state === true || state === false) {
                await prisma.userToolOverride.upsert({
                    where: { userId_toolId: { userId: targetUserId, toolId } },
                    update: { isEnabled: state },
                    create: { userId: targetUserId, toolId, isEnabled: state }
                });
                changes.push(`${toolId}: ${state ? 'GRANTED' : 'DENIED'}`);
            }
        }

        if (changes.length > 0) {
            await logAudit(
                "USER_PERMISSION_OVERRIDE",
                `Updated tool overrides for user '${targetUser?.username}': [${changes.join(', ')}]`,
                session?.user?.id
            );
        }

        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users", "page");

        // Fetch updated list of overrides to return to client
        const updatedOverrides = await prisma.userToolOverride.findMany({
            where: { userId: targetUserId }
        });

        return { 
            success: true, 
            overrides: updatedOverrides.map(o => ({
                ...o,
                createdAt: o.createdAt.toISOString(),
                updatedAt: o.updatedAt.toISOString(),
            }))
        };
    } catch (error) {
        logInternalError(`Error batch saving tool overrides for user ${targetUserId}`, error);
        throw error;
    }
}

export async function getPermissionsDiagnostic() {
    await ensureAdmin();
    try {
        const rawDbUrl = process.env.DATABASE_URL || '';
        let absDbPath = '';
        let exists = false;

        if (rawDbUrl.startsWith('file:') || rawDbUrl.endsWith('.db')) {
            const cleanPath = rawDbUrl.replace(/^file:/, '');
            absDbPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(process.cwd(), cleanPath);
            try {
                exists = fs.existsSync(absDbPath);
            } catch {}
        }

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

export async function resetPermissions(targetRoles?: string[], targetTools?: string[]) {
    const session = await ensureAdmin();
    const rolesToReset = targetRoles ? targetRoles.map(r => r.toUpperCase()) : null;
    const toolsToReset = targetTools ? targetTools.map(t => t.toLowerCase()) : null;

    try {
        if (rolesToReset && toolsToReset) {
            await prisma.toolPermission.deleteMany({
                where: { 
                    role: { in: rolesToReset },
                    toolId: { in: toolsToReset }
                }
            });
        } else if (rolesToReset) {
            await prisma.toolPermission.deleteMany({
                where: { role: { in: rolesToReset } }
            });
        } else if (toolsToReset) {
            await prisma.toolPermission.deleteMany({
                where: { toolId: { in: toolsToReset } }
            });
        } else {
            await prisma.toolPermission.deleteMany({});
        }

        const { defaults } = await getResolvedRoleDefaults();
        const permissionsToCreate: { toolId: string; role: string; isEnabled: boolean }[] = [];

        for (const [toolId, roleMap] of Object.entries(defaults)) {
            if (toolsToReset && !toolsToReset.includes(toolId)) continue;
            for (const [role, isEnabled] of Object.entries(roleMap)) {
                if (rolesToReset && !rolesToReset.includes(role)) continue;
                permissionsToCreate.push({ toolId, role, isEnabled });
            }
        }

        for (const perm of permissionsToCreate) {
            await prisma.toolPermission.upsert({
                where: { toolId_role: { toolId: perm.toolId, role: perm.role } },
                update: { isEnabled: perm.isEnabled },
                create: perm,
            });
        }

        let auditMsg = "Admin reset all tool permissions to role defaults";
        if (rolesToReset && toolsToReset) {
            auditMsg = `Admin reset tool permissions for roles [${rolesToReset.join(', ')}] on tools [${toolsToReset.join(', ')}] to role defaults`;
        } else if (rolesToReset) {
            auditMsg = `Admin reset tool permissions for roles: ${rolesToReset.join(', ')} to role defaults`;
        } else if (toolsToReset) {
            auditMsg = `Admin reset tool permissions for tools: ${toolsToReset.join(', ')} to role defaults`;
        }

        await logAudit("PERMISSION_RESET", auditMsg, session?.user?.id);
        revalidatePath("/", "layout");
        revalidatePath("/queries", "page");
        revalidatePath("/users/permissions", "page");
        return { success: true };
    } catch (error) {
        logInternalError("Error resetting permissions", error);
        throw error;
    }
}
