import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/app/actions/permissions';

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const snapshotId = searchParams.get('snapshotId');

        try {
            const views = await prisma.crawlerSavedView.findMany({
                where: snapshotId ? {
                    OR: [
                        { snapshotId },
                        { snapshotId: null }
                    ]
                } : undefined,
                orderBy: { updatedAt: 'desc' }
            });

            return NextResponse.json({ views });
        } catch (queryErr: any) {
            // Self-healing: if the table hasn't been created yet in PostgreSQL, create it dynamically
            try {
                await prisma.$executeRawUnsafe(`
                    CREATE TABLE IF NOT EXISTS "CrawlerSavedView" (
                        "id" TEXT NOT NULL PRIMARY KEY,
                        "name" TEXT NOT NULL UNIQUE,
                        "description" TEXT,
                        "snapshotId" TEXT,
                        "layoutData" JSONB NOT NULL,
                        "isPublic" BOOLEAN NOT NULL DEFAULT true,
                        "createdBy" TEXT,
                        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS "CrawlerSavedView_snapshotId_idx" ON "CrawlerSavedView"("snapshotId");
                `);
                const views = await prisma.crawlerSavedView.findMany({
                    where: snapshotId ? {
                        OR: [
                            { snapshotId },
                            { snapshotId: null }
                        ]
                    } : undefined,
                    orderBy: { updatedAt: 'desc' }
                });
                return NextResponse.json({ views });
            } catch (createErr: any) {
                console.warn("Could not query or initialize CrawlerSavedView table:", createErr.message);
                return NextResponse.json({ views: [] });
            }
        }
    } catch (e: any) {
        return NextResponse.json({ views: [] });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }
        const username = session?.user?.name || (session?.user as any)?.username || 'Admin';

        const body = await req.json();
        const { name, description, snapshotId, layoutData, isPublic } = body;

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'View name is required' }, { status: 400 });
        }

        if (!layoutData || typeof layoutData !== 'object') {
            return NextResponse.json({ error: 'Valid layout data is required' }, { status: 400 });
        }

        try {
            const savedView = await prisma.crawlerSavedView.upsert({
                where: { name: name.trim() },
                create: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    snapshotId: snapshotId || null,
                    layoutData,
                    isPublic: isPublic !== false,
                    createdBy: username
                },
                update: {
                    description: description?.trim() || null,
                    snapshotId: snapshotId || null,
                    layoutData,
                    isPublic: isPublic !== false,
                    createdBy: username,
                    updatedAt: new Date()
                }
            });

            return NextResponse.json({ success: true, view: savedView });
        } catch (dbErr: any) {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "CrawlerSavedView" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "name" TEXT NOT NULL UNIQUE,
                    "description" TEXT,
                    "snapshotId" TEXT,
                    "layoutData" JSONB NOT NULL,
                    "isPublic" BOOLEAN NOT NULL DEFAULT true,
                    "createdBy" TEXT,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS "CrawlerSavedView_snapshotId_idx" ON "CrawlerSavedView"("snapshotId");
            `);
            const savedView = await prisma.crawlerSavedView.upsert({
                where: { name: name.trim() },
                create: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    snapshotId: snapshotId || null,
                    layoutData,
                    isPublic: isPublic !== false,
                    createdBy: username
                },
                update: {
                    description: description?.trim() || null,
                    snapshotId: snapshotId || null,
                    layoutData,
                    isPublic: isPublic !== false,
                    createdBy: username,
                    updatedAt: new Date()
                }
            });
            return NextResponse.json({ success: true, view: savedView });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'View ID is required' }, { status: 400 });
        }

        await prisma.crawlerSavedView.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
