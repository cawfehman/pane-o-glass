import { prisma } from './prisma';

export interface SiteMetadata {
    code: string;
    name: string;
    address: string;
}

export function parseSiteCsv(csvContent: string): SiteMetadata[] {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length <= 1) return [];

    // Simple parser (assuming no commas in the values for now, or using a smarter split)
    // For production grade, we'd use a real CSV parser, but this handles basic cases.
    const results: SiteMetadata[] = [];
    const headers = lines[0].toLowerCase().split(',');

    const codeIdx = headers.indexOf('code');
    const nameIdx = headers.indexOf('name');
    const addrIdx = headers.indexOf('address');

    if (codeIdx === -1) return [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 1) {
            results.push({
                code: parts[codeIdx]?.toUpperCase() || "UNK",
                name: nameIdx !== -1 ? parts[nameIdx] || "" : "",
                address: addrIdx !== -1 ? parts[addrIdx] || "" : ""
            });
        }
    }

    return results;
}

export async function getCurrentSiteMap(): Promise<Map<string, SiteMetadata>> {
    const latest = await prisma.siteMapVersion.findFirst({
        orderBy: { versionNumber: 'desc' }
    });

    const map = new Map<string, SiteMetadata>();
    
    if (latest) {
        const sites = parseSiteCsv(latest.content);
        sites.forEach(s => map.set(s.code, s));
    }

    return map;
}

export async function saveSiteMap(csvContent: string, filename: string, username: string) {
    const latest = await prisma.siteMapVersion.findFirst({
        orderBy: { versionNumber: 'desc' }
    });

    const nextVersion = (latest?.versionNumber || 0) + 1;

    // Create new version
    const newVersion = await prisma.siteMapVersion.create({
        data: {
            filename,
            content: csvContent,
            versionNumber: nextVersion,
            createdBy: username
        }
    });

    // Prune old versions (keep last 10)
    const allVersions = await prisma.siteMapVersion.findMany({
        orderBy: { versionNumber: 'desc' },
        select: { id: true }
    });

    if (allVersions.length > 10) {
        const idsToDelete = allVersions.slice(10).map(v => v.id);
        await prisma.siteMapVersion.deleteMany({
            where: { id: { in: idsToDelete } }
        });
    }

    return newVersion;
}

export async function getSiteVersions() {
    return await prisma.siteMapVersion.findMany({
        orderBy: { versionNumber: 'desc' },
        select: {
            id: true,
            filename: true,
            versionNumber: true,
            createdBy: true,
            createdAt: true
            // Content excluded for list view
        }
    });
}

export async function getSiteVersionContent(id: string) {
    return await prisma.siteMapVersion.findUnique({
        where: { id },
        select: { content: true, filename: true }
    });
}
