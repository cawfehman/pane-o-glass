import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSiteVersionContent, getCurrentSiteMap } from '@/lib/sites';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        let content = "";
        let filename = "sites_export.csv";

        if (id) {
            const version = await getSiteVersionContent(id);
            if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
            content = version.content;
            filename = version.filename;
        } else {
            const latest = await prisma.siteMapVersion.findFirst({
                orderBy: { versionNumber: 'desc' }
            });
            if (!latest) return NextResponse.json({ error: 'No site map exists yet' }, { status: 404 });
            content = latest.content;
            filename = latest.filename;
        }

        return new Response(content, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
