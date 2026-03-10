import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { tool, subject, body: feedbackBody } = body;

        if (!tool || !subject || !feedbackBody) {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        const feedback = await prisma.feedback.create({
            data: {
                userId: session.user?.id,
                tool,
                subject,
                body: feedbackBody,
            }
        });

        return NextResponse.json(feedback);
    } catch (error) {
        console.error("Feedback submission error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session || (session.user as any)?.role !== "ADMIN") {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const feedback = await prisma.feedback.findMany({
            include: {
                user: {
                    select: {
                        username: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(feedback);
    } catch (error) {
        console.error("Feedback retrieval error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
