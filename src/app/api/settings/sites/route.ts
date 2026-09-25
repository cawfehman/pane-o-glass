import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from "@/app/actions/permissions";
import { getSiteVersions, saveSiteMap, getSiteVersionContent, parseSiteCsv, stringifySiteCsv } from '@/lib/sites';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: 'Unauthorized: Netcrawler permission required' }, { status: 403 });
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
        
        let parsedSites: any[] = [];
        let parsedFolders: string[] = [];
        if (versions.length > 0 && versions[0].content) {
            parsedSites = parseSiteCsv(versions[0].content);
            parsedFolders = (parsedSites as any).folders || [];
        }

        return NextResponse.json({ versions, sites: parsedSites, folders: parsedFolders });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: 'Unauthorized: Netcrawler permission required' }, { status: 403 });
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
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: 'Unauthorized: Netcrawler permission required' }, { status: 403 });
        }

        const body = await req.json();
        const { action, site, versionId, folderPath, oldPath, newPath, siteCode } = body;
        
        if (!['add', 'update', 'delete', 'revert', 'add_folder', 'delete_folder', 'rename_folder', 'move_site'].includes(action)) {
            return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
        }

        const username = session.user.name || 'Admin';
        const userId = (session.user as any)?.id;
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';

        if (action === 'revert') {
            if (!versionId) {
                return NextResponse.json({ error: 'Version ID required for revert' }, { status: 400 });
            }
            const targetContent = await getSiteVersionContent(versionId);
            if (!targetContent || !targetContent.content) {
                return NextResponse.json({ error: 'Target version snapshot not found' }, { status: 404 });
            }

            const versions = await getSiteVersions();
            const targetVerObj = versions.find(v => v.id === versionId);
            const targetVerStr = targetVerObj ? `v${targetVerObj.versionNumber}` : 'archived set';

            const filename = `Reverted_to_${targetVerStr}_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(targetContent.content, filename, username);
            await logAudit("SITE_REVERT", `Reverted live mapping engine schema directly to ${targetVerStr} baseline snapshot`, userId, clientIp);

            const parsed = parseSiteCsv(targetContent.content);
            return NextResponse.json({ success: true, version: newVersion, sites: parsed, folders: (parsed as any).folders || [] });
        }

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

        // Parse current sites and declared folders
        let sites = currentCsv ? parseSiteCsv(currentCsv) : [];
        let folders: string[] = (sites as any).folders ? [...(sites as any).folders] : [];

        if (action === 'add_folder') {
            if (!folderPath || typeof folderPath !== 'string') {
                return NextResponse.json({ error: 'folderPath is required' }, { status: 400 });
            }
            const clean = folderPath.trim().replace(/^\/+|\/+$/g, '');
            if (!clean) return NextResponse.json({ error: 'Invalid folder path' }, { status: 400 });
            if (!folders.includes(clean)) {
                folders.push(clean);
                folders.sort();
            }
            const newCsvContent = stringifySiteCsv(sites, folders);
            const filename = `Folder_Add_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(newCsvContent, filename, username);
            await logAudit("FOLDER_CREATE", `Created site folder/group '${clean}' (v${newVersion.versionNumber})`, userId, clientIp);
            return NextResponse.json({ success: true, version: newVersion, sites, folders });
        }

        if (action === 'delete_folder') {
            if (!folderPath || typeof folderPath !== 'string') {
                return NextResponse.json({ error: 'folderPath is required' }, { status: 400 });
            }
            const target = folderPath.trim();
            folders = folders.filter(f => f !== target && !f.startsWith(target + '/'));
            for (const s of sites) {
                if (s.folderPath === target || (s.folderPath || '').startsWith(target + '/')) {
                    s.folderPath = '';
                }
            }
            const newCsvContent = stringifySiteCsv(sites, folders);
            const filename = `Folder_Delete_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(newCsvContent, filename, username);
            await logAudit("FOLDER_DELETE", `Deleted site folder/group '${target}' (v${newVersion.versionNumber})`, userId, clientIp);
            return NextResponse.json({ success: true, version: newVersion, sites, folders });
        }

        if (action === 'rename_folder') {
            if (!oldPath || !newPath) {
                return NextResponse.json({ error: 'oldPath and newPath are required' }, { status: 400 });
            }
            const cleanOld = oldPath.trim();
            const cleanNew = newPath.trim().replace(/^\/+|\/+$/g, '');
            folders = folders.map(f => {
                if (f === cleanOld) return cleanNew;
                if (f.startsWith(cleanOld + '/')) return cleanNew + f.slice(cleanOld.length);
                return f;
            });
            for (const s of sites) {
                if (s.folderPath === cleanOld) {
                    s.folderPath = cleanNew;
                } else if ((s.folderPath || '').startsWith(cleanOld + '/')) {
                    s.folderPath = cleanNew + s.folderPath.slice(cleanOld.length);
                }
            }
            const newCsvContent = stringifySiteCsv(sites, folders);
            const filename = `Folder_Rename_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(newCsvContent, filename, username);
            await logAudit("FOLDER_RENAME", `Renamed site folder from '${cleanOld}' to '${cleanNew}' (v${newVersion.versionNumber})`, userId, clientIp);
            return NextResponse.json({ success: true, version: newVersion, sites, folders });
        }

        if (action === 'move_site') {
            const targetCode = (siteCode || site?.code || '').toUpperCase().trim();
            const targetFolder = (folderPath !== undefined ? folderPath : site?.folderPath || '').trim();
            if (!targetCode) {
                return NextResponse.json({ error: 'siteCode is required' }, { status: 400 });
            }
            const sIdx = sites.findIndex(s => s.code.toUpperCase() === targetCode);
            if (sIdx === -1) {
                return NextResponse.json({ error: `Site ${targetCode} not found` }, { status: 404 });
            }
            sites[sIdx].folderPath = targetFolder;
            if (targetFolder && !folders.includes(targetFolder)) {
                folders.push(targetFolder);
                folders.sort();
            }
            const newCsvContent = stringifySiteCsv(sites, folders);
            const filename = `Site_Move_${Date.now()}.csv`;
            const newVersion = await saveSiteMap(newCsvContent, filename, username);
            await logAudit("SITE_MOVE", `Moved site ${targetCode} to '${targetFolder || 'Unassigned'}' (v${newVersion.versionNumber})`, userId, clientIp);
            return NextResponse.json({ success: true, version: newVersion, sites, folders });
        }

        if (!site || !site.code) {
            return NextResponse.json({ error: 'Invalid request payload: site data required' }, { status: 400 });
        }

        // Apply site add/update/delete
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
                notes: site.notes || "",
                locationType: site.locationType || undefined,
                city: site.city || undefined,
                folderPath: site.folderPath || undefined,
                isHub: site.isHub !== undefined ? Boolean(site.isHub) : undefined
            });
            if (site.folderPath && !folders.includes(site.folderPath)) {
                folders.push(site.folderPath);
            }
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
                notes: site.notes ?? sites[siteIndex].notes,
                locationType: site.locationType !== undefined ? site.locationType : sites[siteIndex].locationType,
                city: site.city !== undefined ? site.city : sites[siteIndex].city,
                folderPath: site.folderPath !== undefined ? site.folderPath : sites[siteIndex].folderPath,
                isHub: site.isHub !== undefined ? Boolean(site.isHub) : sites[siteIndex].isHub
            };
            if (site.folderPath && !folders.includes(site.folderPath)) {
                folders.push(site.folderPath);
            }
        } else if (action === 'delete') {
            if (siteIndex === -1) {
                return NextResponse.json({ error: 'Site code not found for deletion' }, { status: 404 });
            }
            sites.splice(siteIndex, 1);
        }

        // Convert back to CSV
        const newCsvContent = stringifySiteCsv(sites, folders);
        const filename = `UI_Update_v${versionNum}_${Date.now()}.csv`;

        // Save new version
        const newVersion = await saveSiteMap(newCsvContent, filename, username);
        
        const actionLabel = action === 'add' ? 'SITE_CREATE' : action === 'update' ? 'SITE_UPDATE' : 'SITE_DELETE';
        const actionDesc = action === 'add' 
            ? `Created site record ${site.code.toUpperCase()} (${site.name || site.code.toUpperCase()})` 
            : action === 'update' 
            ? `Updated site record ${site.code.toUpperCase()}` 
            : `Deleted site record ${site.code.toUpperCase()}`;
            
        await logAudit(actionLabel, `${actionDesc} via inline management console (v${newVersion.versionNumber})`, userId, clientIp);
        
        return NextResponse.json({ success: true, version: newVersion, sites, folders });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
