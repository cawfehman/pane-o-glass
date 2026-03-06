import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export async function GET() {
    try {
        const hashedPassword = bcrypt.hashSync('admin123', 10);

        const admin = await prisma.user.upsert({
            where: { username: 'admin' },
            update: {},
            create: {
                username: 'admin',
                password: hashedPassword,
                role: 'ADMIN',
            },
        });

        return NextResponse.json({ message: "Seeded admin user successfully", user: admin.username })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
