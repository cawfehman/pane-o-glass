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
    const role = formData.get("role") as string || "USER";
    const isExternal = formData.get("isExternal") === "on";

    if (!username || !password) {
        throw new Error("Username and password required");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
            role,
            isExternal
        }
    });

    const session = await auth();
    await logAudit("USER_CREATE", `Created new user: ${username} with role ${role}`, session?.user?.id);

    revalidatePath("/users");
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
    if (role) updateData.role = role;
    if (isExternal !== null) updateData.isExternal = isExternal === "on";
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({
        where: { id },
        data: updateData
    });

    const session = await auth();
    await logAudit("USER_UPDATE", `Updated user: ${userToUpdate?.username}`, session?.user?.id);

    revalidatePath("/users");
}
