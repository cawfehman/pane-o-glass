import { prisma } from './prisma';

export interface SiteMetadata {
    code: string;
    name: string;
    address: string;
    status: string; // Active, Retired, Future
    notes?: string;
}

export function parseSiteCsv(csvContent: string): SiteMetadata[] {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length <= 1) return [];

    // Smarter split that respects double quotes for fields with commas
    const splitCsvRow = (row: string) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = splitCsvRow(lines[0]).map(h => h.toLowerCase());
    const codeIdx = headers.indexOf('code');
    const nameIdx = headers.indexOf('name');
    const addrIdx = headers.indexOf('address');
    const statusIdx = headers.indexOf('status');
    const notesIdx = headers.indexOf('notes');

    if (codeIdx === -1) return [];

    const results: SiteMetadata[] = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = splitCsvRow(lines[i]);
        if (parts.length >= 1) {
            const code = parts[codeIdx]?.toUpperCase() || "UNK";
            const rawName = nameIdx !== -1 ? parts[nameIdx] || "" : "";
            
            results.push({
                code,
                name: rawName || code,
                address: addrIdx !== -1 ? parts[addrIdx] || "" : "",
                status: statusIdx !== -1 ? parts[statusIdx] || "Active" : "Active",
                notes: notesIdx !== -1 ? parts[notesIdx] || "" : ""
            });
        }
    }

    return results;
}

export function stringifySiteCsv(sites: SiteMetadata[]): string {
    const headers = ["Code", "Name", "Address", "Status", "Notes"];
    const rows = [headers.join(",")];

    for (const site of sites) {
        // Wrap fields in quotes if they contain commas, quotes, or newlines
        const formatField = (field: string | undefined) => {
            if (!field) return "";
            if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        const row = [
            formatField(site.code),
            formatField(site.name),
            formatField(site.address),
            formatField(site.status),
            formatField(site.notes)
        ];
        rows.push(row.join(","));
    }

    return rows.join("\n");
}

export async function getCurrentSiteMap(): Promise<Map<string, SiteMetadata>> {
    const map = new Map<string, SiteMetadata>();

    try {
        const latest = await prisma.siteMapVersion.findFirst({
            orderBy: { versionNumber: 'desc' }
        });

        if (latest) {
            const sites = parseSiteCsv(latest.content);
            sites.forEach(s => map.set(s.code, s));
        }
    } catch (e) {
        console.error("[SITES-LIB] Failed to fetch site map from database. Table might be missing.", e);
        // Fallback to empty map so triage doesn't crash
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
