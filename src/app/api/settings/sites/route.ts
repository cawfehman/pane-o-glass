import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from "@/app/actions/permissions";
import { getSiteVersions, saveSiteMap, getSiteVersionContent } from '@/lib/sites';

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const versions = await getSiteVersions();
        
        // Attach content to the latest version so the frontend can render the preview/stats
        if (versions.length > 0) {
            const latestContent = await getSiteVersionContent(versions[0].id);
            if (latestContent) {
                (versions[0] as any).content = latestContent.content;
            }
        }
        
        return NextResponse.json({ versions });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const content = await file.text();
        const filename = file.name;
        const username = session.user.name || 'Admin';

        // Basic validation: Check if it has a header with 'code'
        const firstLine = content.split('\n')[0].toLowerCase();
        if (!firstLine.includes('code')) {
            return NextResponse.json({ error: 'Invalid CSV: Must include a "Code" column.' }, { status: 400 });
        }

        const newVersion = await saveSiteMap(content, filename, username);
        return NextResponse.json({ success: true, version: newVersion });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
