import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from "@/app/actions/permissions";
import { getSiteVersions, saveSiteMap, getSiteVersionContent, parseSiteCsv, stringifySiteCsv } from '@/lib/sites';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'site-management'))) {
            return NextResponse.json({ error: 'Unauthorized: Site Management permission required' }, { status: 403 });
        }

        let versions = await getSiteVersions();
        
        // Attach content to the latest version so the frontend can render the preview/stats
        if (versions.length > 0) {
            const latestContent = await getSiteVersionContent(versions[0].id);
            if (latestContent) {
                (versions[0] as any).content = latestContent.content;
            }
        } else {
            const defaultCsvContent = `Code,Name,Address,Status,Notes\nCAM,Camden Main Campus,"1 Cooper Plaza, Camden, NJ 08103",Active,Primary enterprise complex & acute care facility\nVOO,Voorhees Specialty Care,"900 Centennial Blvd, Voorhees Township, NJ 08043",Active,Ambulatory surgical suites and specialist wings\nCHE,Cherry Hill Outpatient,"1210 Brace Rd, Cherry Hill, NJ 08034",Active,Regional diagnostic labs and family medicine\nMOO,Moorestown Corporate Center,"401 Young Ave, Moorestown, NJ 08057",Active,IT operations, corporate accounting, billing`;
            versions = [{
                id: 'default-seeded-v1',
                filename: 'Initial_Seed_v1.csv',
                versionNumber: 1,
                createdBy: 'System Provisioner',
                createdAt: new Date(),
                content: defaultCsvContent
            } as any];
        }
        
        return NextResponse.json({ versions });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'site-management'))) {
            return NextResponse.json({ error: 'Unauthorized: Site Management permission required' }, { status: 403 });
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
        const userId = (session.user as any)?.id;
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
        await logAudit("SITE_MAP_INGEST", `Ingested full directory mapping spreadsheet: ${filename} (v${newVersion.versionNumber})`, userId, clientIp);
        return NextResponse.json({ success: true, version: newVersion });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'site-management'))) {
            return NextResponse.json({ error: 'Unauthorized: Site Management permission required' }, { status: 403 });
        }

        const body = await req.json();
        const { action, site, versionId } = body;
        
        if (!['add', 'update', 'delete', 'revert'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
        }

        if (action === 'revert') {
            if (!versionId) {
                return NextResponse.json({ error: 'Version ID required for revert' }, { status: 400 });
            }
            const targetContent = await getSiteVersionContent(versionId);
            if (!targetContent || !targetContent.content) {
                return NextResponse.json({ error: 'Target version snapshot not found' }, { status: 404 });
            }

            const username = session.user.name || 'Admin';
            const versions = await getSiteVersions();
            const targetVerObj = versions.find(v => v.id === versionId);
            const targetVerStr = targetVerObj ? `v${targetVerObj.versionNumber}` : 'archived set';

            const filename = `Reverted_to_${targetVerStr}_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(targetContent.content, filename, username);

            const userId = (session.user as any)?.id;
            const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
            await logAudit("SITE_REVERT", `Reverted live mapping engine schema directly to ${targetVerStr} baseline snapshot`, userId, clientIp);

            return NextResponse.json({ success: true, version: newVersion });
        }

        if (!site || !site.code) {
            return NextResponse.json({ error: 'Invalid request payload: site data required' }, { status: 400 });
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
        } else {
            currentCsv = `Code,Name,Address,Status,Notes\nCAM,Camden Main Campus,"1 Cooper Plaza, Camden, NJ 08103",Active,Primary enterprise complex & acute care facility\nVOO,Voorhees Specialty Care,"900 Centennial Blvd, Voorhees Township, NJ 08043",Active,Ambulatory surgical suites and specialist wings\nCHE,Cherry Hill Outpatient,"1210 Brace Rd, Cherry Hill, NJ 08034",Active,Regional diagnostic labs and family medicine\nMOO,Moorestown Corporate Center,"401 Young Ave, Moorestown, NJ 08057",Active,IT operations, corporate accounting, billing`;
        }

        // Parse current sites
        let sites = currentCsv ? parseSiteCsv(currentCsv) : [];

        // Apply action
        const targetCode = site.oldCode || site.code;
        const siteIndex = sites.findIndex(s => s.code.toUpperCase() === targetCode.toUpperCase());

        if (action === 'add') {
            if (siteIndex !== -1) {
                return NextResponse.json({ error: 'Site code already exists' }, { status: 400 });
            }
            sites.push({
                code: site.code.toUpperCase(),
                name: site.name || site.code.toUpperCase(),
                address: site.address || "",
                status: site.status || "Active",
                notes: site.notes || ""
            });
        } else if (action === 'update') {
            if (siteIndex === -1) {
                return NextResponse.json({ error: 'Site code not found for update' }, { status: 404 });
            }
            sites[siteIndex] = {
                ...sites[siteIndex],
                code: site.code ? site.code.toUpperCase() : sites[siteIndex].code,
                name: site.name || sites[siteIndex].name,
                address: site.address ?? sites[siteIndex].address,
                status: site.status || sites[siteIndex].status,
                notes: site.notes ?? sites[siteIndex].notes
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
        
        const userId = (session.user as any)?.id;
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
        const actionLabel = action === 'add' ? 'SITE_CREATE' : action === 'update' ? 'SITE_UPDATE' : 'SITE_DELETE';
        const actionDesc = action === 'add' 
            ? `Created site record ${site.code.toUpperCase()} (${site.name || site.code.toUpperCase()})` 
            : action === 'update' 
            ? `Updated site record ${site.code.toUpperCase()}` 
            : `Deleted site record ${site.code.toUpperCase()}`;
            
        await logAudit(actionLabel, `${actionDesc} via inline management console (v${newVersion.versionNumber})`, userId, clientIp);
        
        return NextResponse.json({ success: true, version: newVersion });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
