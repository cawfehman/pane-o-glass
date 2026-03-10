import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export async function GET() {
    console.log("Seed API triggered...");
    
    // Security Guard: Only allow seeding in development mode
    if (process.env.NODE_ENV === 'production') {
        console.warn("Seeding attempt blocked in production environment.");
        return new NextResponse("Not Found", { status: 404 });
    }

    try {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        console.log("Hashed password generated.");

        const accounts = [
            { username: 'admin', role: 'ADMIN' },
            { username: 'test-user', role: 'USER' },
            { username: 'test-analyst', role: 'ANALYST' },
            { username: 'test-network', role: 'NETWORK' },
        ];

        const seededUsers = [];

        for (const acc of accounts) {
            const user = await prisma.user.upsert({
                where: { username: acc.username },
                update: { 
                    password: hashedPassword,
                    role: acc.role
                },
                create: {
                    username: acc.username,
                    password: hashedPassword,
                    role: acc.role,
                },
            });
            seededUsers.push(user.username);
            console.log(`User ${user.username} (${user.role}) upserted successfully.`);
        }

        return NextResponse.json({ 
            message: "Seeding complete. All accounts reset to password: admin123", 
            users: seededUsers,
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
