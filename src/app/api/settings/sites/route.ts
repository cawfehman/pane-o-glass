import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from "@/app/actions/permissions";
import { getSiteVersions, saveSiteMap, getSiteVersionContent, parseSiteCsv, stringifySiteCsv } from '@/lib/sites';

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

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { action, site } = body;
        
        if (!['add', 'update', 'delete'].includes(action) || !site || !site.code) {
            return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
        }

        const username = session.user.name || 'Admin';

        // Get latest version content
        const versions = await getSiteVersions();
        let currentCsv = "";
        let versionNum = 1;

        if (versions.length > 0) {
            const latestContent = await getSiteVersionContent(versions[0].id);
            if (latestContent) {
                currentCsv = latestContent.content;
            }
            versionNum = versions[0].versionNumber + 1;
        }

        // Parse current sites
        let sites = currentCsv ? parseSiteCsv(currentCsv) : [];

        // Apply action
        const siteIndex = sites.findIndex(s => s.code.toUpperCase() === site.code.toUpperCase());

        if (action === 'add') {
            if (siteIndex !== -1) {
                return NextResponse.json({ error: 'Site code already exists' }, { status: 400 });
            }
            sites.push({
                code: site.code.toUpperCase(),
                name: site.name || site.code.toUpperCase(),
                address: site.address || "",
                status: site.status || "Active"
            });
        } else if (action === 'update') {
            if (siteIndex === -1) {
                return NextResponse.json({ error: 'Site code not found for update' }, { status: 404 });
            }
            sites[siteIndex] = {
                ...sites[siteIndex],
                name: site.name || sites[siteIndex].name,
                address: site.address ?? sites[siteIndex].address,
                status: site.status || sites[siteIndex].status
            };
        } else if (action === 'delete') {
            if (siteIndex === -1) {
                return NextResponse.json({ error: 'Site code not found for deletion' }, { status: 404 });
            }
            sites.splice(siteIndex, 1);
        }

        // Convert back to CSV
        const newCsvContent = stringifySiteCsv(sites);
        const filename = `UI_Update_v${versionNum}_${Date.now()}.csv`;

        // Save new version
        const newVersion = await saveSiteMap(newCsvContent, filename, username);
        
        return NextResponse.json({ success: true, version: newVersion });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
