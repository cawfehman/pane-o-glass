"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";

export async function performLogout() {
    await signOut({ redirectTo: "/login" });
}

export async function createUser(formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string || "USER";

    if (!username || !password) {
        throw new Error("Username and password required");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
            role
        }
    });

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

    revalidatePath("/users");
}

export async function updateUser(id: string, formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string;

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
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({
        where: { id },
        data: updateData
    });

    revalidatePath("/users");
}
