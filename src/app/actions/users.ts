"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { signOut, auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function performLogout() {
    await signOut({ redirectTo: "/login" });
}

export async function createUser(formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const firstName = formData.get("firstName") as string || null;
    const lastName = formData.get("lastName") as string || null;
    const role = formData.get("role") as string || "USER";
    const isExternal = formData.get("isExternal") === "on";

    if (!username) {
        throw new Error("Username is required");
    }

    if (!isExternal && !password) {
        throw new Error("Password is required for local accounts");
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const newUser = await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
            firstName,
            lastName,
            role,
            isExternal
        }
    });

    const session = await auth();
    await logAudit("USER_CREATE", `Created new user: ${username} (${firstName || ''} ${lastName || ''}) with role ${role}, isExternal: ${isExternal}`, session?.user?.id);

    revalidatePath("/users");
    return newUser;
}

export async function deleteUser(id: string) {
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (userToDelete?.role === 'ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
            throw new Error("Cannot delete the last admin user.");
        }
    }

    await prisma.user.delete({
        where: { id }
    });

    const session = await auth();
    await logAudit("USER_DELETE", `Deleted user: ${userToDelete?.username}`, session?.user?.id);

    revalidatePath("/users");
}

export async function updateUser(id: string, formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const role = formData.get("role") as string;
    const isExternal = formData.get("isExternal");

    const userToUpdate = await prisma.user.findUnique({ where: { id } });

    if (userToUpdate?.role === 'ADMIN' && role === 'USER') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
            throw new Error("Cannot demote the last admin user.");
        }
    }

    const updateData: any = {};
    if (username) updateData.username = username;
    if (firstName !== undefined) updateData.firstName = firstName || null;
    if (lastName !== undefined) updateData.lastName = lastName || null;
    if (role) updateData.role = role;
    if (isExternal !== null) updateData.isExternal = isExternal === "on";
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    } else if (updateData.isExternal === true) {
        // If switching to external, we could null out the password or keep it. 
        // For security, if it's external, we shouldn't rely on the local password.
        // updateData.password = null;
    }

    await prisma.user.update({
        where: { id },
        data: updateData
    });

    const session = await auth();
    let auditMessage = `Updated user: ${userToUpdate?.username}`;
    const changes = [];
    if (password) changes.push("password");
    if (role && role !== userToUpdate?.role) changes.push(`role to ${role}`);
    if (username && username !== userToUpdate?.username) changes.push(`username to ${username}`);
    if (isExternal !== null) {
        const newExt = isExternal === "on";
        if (newExt !== userToUpdate?.isExternal) changes.push(`external status to ${newExt}`);
    }
    
    if (changes.length > 0) {
        auditMessage += ` (${changes.join(", ")})`;
    }

    await logAudit("USER_UPDATE", auditMessage, session?.user?.id);

    revalidatePath("/users");
}

export async function changeOwnPassword(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    });

    if (!user || user.isExternal) {
        throw new Error("Cannot change password for this account type.");
    }

    if (!user.password) {
        throw new Error("Account has no local password to change.");
    }

    const passwordsMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordsMatch) {
        throw new Error("Current password incorrect.");
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedNewPassword }
    });

    await logAudit("USER_PASSWORD_CHANGE", `User changed their own password`, user.id);
    
    return { success: true };
}

export async function updateSessionTimeout(minutes: number) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    // Validate: 1 minute to 30 minutes
    const validatedMinutes = Math.max(1, Math.min(30, minutes));

    await prisma.user.update({
        where: { id: session.user.id },
        data: { sessionTimeout: validatedMinutes }
    });

    await logAudit("USER_PREFERENCE_CHANGE", `User updated session timeout to ${validatedMinutes} minutes`, session.user.id);
    
    revalidatePath("/profile");
    return { success: true, timeout: validatedMinutes };
}
