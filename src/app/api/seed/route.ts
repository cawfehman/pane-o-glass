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
            update: { 
                password: hashedPassword,
                role: 'ADMIN' // Ensure it's ADMIN
            },
            create: {
                username: 'admin',
                password: hashedPassword,
                role: 'ADMIN',
            },
        });

        console.log("Admin user upserted successfully:", admin.username);
        return NextResponse.json({ 
            message: "Seeded admin user successfully. Default password: admin123", 
            user: admin.username,
            role: admin.role,
            nextSteps: "Visit the Tool Permissions page and click 'Reset Defaults' to populate the new roles and permissions."
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
