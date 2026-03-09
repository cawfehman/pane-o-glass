import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export async function GET() {
    console.log("Seed API triggered...");
    try {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        console.log("Hashed password generated.");

        const admin = await prisma.user.upsert({
            where: { username: 'admin' },
            update: { password: hashedPassword },
            create: {
                username: 'admin',
                password: hashedPassword,
                role: 'ADMIN',
            },
        });

        console.log("Admin user upserted successfully:", admin.username);
        return NextResponse.json({ 
            message: "Seeded admin user successfully", 
            user: admin.username,
            role: admin.role
        });
    } catch (error: any) {
        console.error("SEEDING ERROR:", error);
        return NextResponse.json({ 
            error: error.message, 
            stack: error.stack,
            env: process.env.DATABASE_URL
        }, { status: 500 });
    }
}
