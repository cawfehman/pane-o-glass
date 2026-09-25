import { prisma } from './prisma';
import { logAudit } from './audit';

export interface SiteMetadata {
    code: string;
    name: string;
    address: string;
    status: string; // Active, Retired, Future
    notes?: string;
    locationType?: string; // Campus, Administrative, Ambulatory
    city?: string;
    folderPath?: string; // e.g. "Campus/Camden/Acute Care"
    isHub?: boolean;
}

export function getSiteClassification(
    siteCode?: string | null,
    metadata?: Partial<SiteMetadata> | null
): { locationType: string; city: string; folderPath: string; isHub: boolean; groupKey: string } {
    const code = (siteCode || "").toUpperCase().trim();
    let locationType = (metadata?.locationType || "").trim();
    let city = (metadata?.city || "").trim();
    const folderPath = (metadata?.folderPath || "").trim();
    const isHub = metadata?.isHub !== undefined ? Boolean(metadata.isHub) : (["KEL", "CRM", "VMM", "RDG", "WDC"].includes(code));

    // 1. Resolve Location Type
    if (!locationType) {
        if (folderPath) {
            const firstSegment = folderPath.split("/")[0].trim();
            if (/campus/i.test(firstSegment)) locationType = "Campus";
            else if (/admin/i.test(firstSegment)) locationType = "Administrative";
            else if (/ambulatory/i.test(firstSegment)) locationType = "Ambulatory";
        }
        if (!locationType) {
            const campusCodes = new Set(["KEL", "PAV", "DOR", "ENR", "3CP", "CCI", "CRM"]);
            const adminCodes = new Set(["WDC", "RDG", "L3B", "101"]);
            if (campusCodes.has(code)) {
                locationType = "Campus";
            } else if (adminCodes.has(code)) {
                locationType = "Administrative";
            } else {
                locationType = "Ambulatory";
            }
        }
    } else {
        if (/campus/i.test(locationType)) locationType = "Campus";
        else if (/admin/i.test(locationType)) locationType = "Administrative";
        else if (/ambulatory/i.test(locationType)) locationType = "Ambulatory";
    }

    // 2. Resolve City
    if (!city) {
        const addr = (metadata?.address || "").trim();
        if (addr) {
            const match = addr.match(/(?:,\s*|\n)([A-Za-z\s.-]+),\s*[A-Z]{2}\b/);
            if (match && match[1]) {
                city = match[1].trim();
            } else if (addr.includes(",")) {
                const parts = addr.split(",").map(p => p.trim());
                if (parts.length >= 2 && parts[1]) {
                    city = parts[1].replace(/\s+[A-Z]{2}\s+\d{5}.*$/, "").trim();
                }
            }
        }
    }

    // Fallbacks if city is still unpopulated
    if (!city) {
        if (locationType === "Campus") {
            city = "Camden";
        } else {
            city = "Regional";
        }
    }

    const groupKey = folderPath || `${locationType} - ${city}`;

    return {
        locationType,
        city,
        folderPath,
        isHub,
        groupKey
    };
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

    const headers = splitCsvRow(lines[0]).map(h => h.toLowerCase().trim().replace(/[-_]/g, ' '));
    const codeIdx = headers.indexOf('code');
    const nameIdx = headers.indexOf('name');
    const addrIdx = headers.indexOf('address');
    const statusIdx = headers.indexOf('status');
    const notesIdx = headers.indexOf('notes');
    const locTypeIdx = headers.findIndex(h => h === 'location type' || h === 'locationtype' || h === 'type');
    const cityIdx = headers.indexOf('city');
    const folderIdx = headers.findIndex(h => h === 'folder path' || h === 'folderpath' || h === 'folder' || h === 'group path' || h === 'group');
    const isHubIdx = headers.findIndex(h => h === 'is hub' || h === 'ishub' || h === 'hub');

    if (codeIdx === -1) return [];

    const results: SiteMetadata[] = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = splitCsvRow(lines[i]);
        if (parts.length >= 1) {
            const code = parts[codeIdx]?.toUpperCase() || "UNK";
            const rawName = nameIdx !== -1 ? parts[nameIdx] || "" : "";
            const locTypeRaw = locTypeIdx !== -1 ? parts[locTypeIdx]?.trim() || undefined : undefined;
            const cityRaw = cityIdx !== -1 ? parts[cityIdx]?.trim() || undefined : undefined;
            const folderRaw = folderIdx !== -1 ? parts[folderIdx]?.trim() || undefined : undefined;
            const isHubRaw = isHubIdx !== -1 ? /^(true|yes|1|y)$/i.test(parts[isHubIdx]?.trim() || '') : undefined;
            
            results.push({
                code,
                name: rawName || code,
                address: addrIdx !== -1 ? parts[addrIdx] || "" : "",
                status: statusIdx !== -1 ? parts[statusIdx] || "Active" : "Active",
                notes: notesIdx !== -1 ? parts[notesIdx] || "" : "",
                locationType: locTypeRaw,
                city: cityRaw,
                folderPath: folderRaw,
                isHub: isHubRaw
            });
        }
    }

    return results;
}

export function stringifySiteCsv(sites: SiteMetadata[]): string {
    const headers = ["Code", "Name", "Address", "Folder Path", "Location Type", "City", "Is Hub", "Status", "Notes"];
    const rows = [headers.join(",")];

    for (const site of sites) {
        // Wrap fields in quotes if they contain commas, quotes, or newlines
        const formatField = (field: string | undefined | boolean) => {
            if (field === undefined || field === null) return "";
            if (typeof field === "boolean") return field ? "Yes" : "No";
            if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        const classification = getSiteClassification(site.code, site);

        const row = [
            formatField(site.code),
            formatField(site.name),
            formatField(site.address),
            formatField(site.folderPath || classification.folderPath),
            formatField(site.locationType || classification.locationType),
            formatField(site.city || classification.city),
            formatField(site.isHub !== undefined ? site.isHub : classification.isHub),
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

    // Prune old versions (keep last 100)
    const allVersions = await prisma.siteMapVersion.findMany({
        orderBy: { versionNumber: 'desc' },
        select: { id: true }
    });

    if (allVersions.length > 100) {
        const idsToDelete = allVersions.slice(100).map(v => v.id);
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

/**
 * Ensures that sites discovered by the crawler for fully reachable/verified devices
 * exist in the authoritative Site Directory (SiteMapVersion).
 *
 * If a verified reachable device reports a site code not currently present in the Site Directory,
 * this function automatically registers the site with status 'Active', marks it with provenance notes,
 * saves a new SiteMapVersion snapshot, and records a SITE_CREATED_BY_CRAWLER audit log entry.
 */
export async function ensureSitesExistFromDevices(
    devices: any[],
    sessionUser?: { id?: string; username?: string; email?: string; ipAddress?: string }
): Promise<{ createdCount: number; newSites: SiteMetadata[]; siteMap: Map<string, SiteMetadata> }> {
    const siteMap = await getCurrentSiteMap();
    if (!Array.isArray(devices) || devices.length === 0) {
        return { createdCount: 0, newSites: [], siteMap };
    }

    // Only process fully reachable / verified devices
    const reachableDevices = devices.filter(d => d.status === "REACHABLE");
    if (reachableDevices.length === 0) {
        return { createdCount: 0, newSites: [], siteMap };
    }

    // Query overrides so devices with siteOverride use their authoritative overridden site
    let overrideMap = new Map<string, any>();
    try {
        const overrides = await prisma.crawlerDeviceOverride.findMany();
        for (const ov of overrides) {
            if (ov.hostname) overrideMap.set(ov.hostname.toLowerCase(), ov);
        }
    } catch {}

    const missingSites = new Map<string, any>();

    for (const dev of reachableDevices) {
        const normHost = dev.hostname ? String(dev.hostname).split(".")[0].split("(")[0].trim().toLowerCase() : "";
        const override = overrideMap.get(normHost) || (dev.ipAddress ? overrideMap.get(String(dev.ipAddress).trim().toLowerCase()) : null);
        
        let siteCode = override?.siteOverride ? String(override.siteOverride).trim().toUpperCase() : "";
        if (!siteCode) {
            siteCode = dev.site ? String(dev.site).trim().toUpperCase() : "";
        }
        if (!siteCode && dev.site_info?.site) {
            siteCode = String(dev.site_info.site).trim().toUpperCase();
        }
        if (!siteCode && dev.hostname) {
            const shortHost = String(dev.hostname).split(".")[0].trim();
            if (shortHost.length >= 3) {
                siteCode = shortHost.slice(0, 3).toUpperCase();
            }
        }

        // Ignore invalid or placeholder site codes
        if (!siteCode || siteCode.length < 2 || ["UNKNOWN", "UNK", "NONE", "NULL"].includes(siteCode)) {
            continue;
        }

        // Case-insensitive lookup in current site map
        const existingCode = Array.from(siteMap.keys()).find(k => k.toUpperCase() === siteCode);
        if (!existingCode && !missingSites.has(siteCode)) {
            missingSites.set(siteCode, dev);
        }
    }

    if (missingSites.size === 0) {
        return { createdCount: 0, newSites: [], siteMap };
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const newSitesToCreate: SiteMetadata[] = [];

    for (const [code, dev] of missingSites.entries()) {
        const hostStr = dev.hostname ? String(dev.hostname).split(".")[0].trim() : (dev.ipAddress || dev.ip_address || "unknown");
        const ipStr = dev.ipAddress || dev.ip_address || "N/A";
        const note = `Created by Crawler on ${todayStr} via verified switch ${hostStr} (${ipStr}). Flagged for administrative verification.`;

        const newSite: SiteMetadata = {
            code,
            name: `Site ${code}`,
            address: "",
            status: "Active",
            notes: note
        };

        newSitesToCreate.push(newSite);
        siteMap.set(code, newSite);
    }

    // Generate updated CSV and save as a new version
    const allSites = Array.from(siteMap.values());
    const csvContent = stringifySiteCsv(allSites);
    const creator = sessionUser?.username || sessionUser?.email || "crawler-system";

    await saveSiteMap(csvContent, "crawler_auto_registered.csv", creator);

    const siteCodesList = newSitesToCreate.map(s => s.code).join(", ");
    await logAudit(
        "SITE_CREATED_BY_CRAWLER",
        `Crawler auto-registered ${newSitesToCreate.length} new site(s) in authoritative Site Directory: ${siteCodesList}. Source: Fully verified reachable switch telemetry.`,
        sessionUser?.id,
        sessionUser?.ipAddress
    );

    return {
        createdCount: newSitesToCreate.length,
        newSites: newSitesToCreate,
        siteMap
    };
}

/**
 * Removes specified site codes from the authoritative Site Directory (SiteMapVersion).
 * Useful when an errant site (like 'WLC') was created due to non-standard hostnames
 * and has been corrected via device overrides.
 */
export async function removeDirectorySites(
    siteCodesToRemove: string[],
    sessionUser?: { id?: string; username?: string; email?: string; ipAddress?: string }
): Promise<{ removedCount: number; remainingSites: SiteMetadata[] }> {
    const siteMap = await getCurrentSiteMap();
    if (!Array.isArray(siteCodesToRemove) || siteCodesToRemove.length === 0) {
        return { removedCount: 0, remainingSites: Array.from(siteMap.values()) };
    }

    const removeSet = new Set(siteCodesToRemove.map(s => s.trim().toUpperCase()));
    let removedCount = 0;

    for (const code of Array.from(siteMap.keys())) {
        if (removeSet.has(code.toUpperCase())) {
            siteMap.delete(code);
            removedCount++;
        }
    }

    if (removedCount > 0) {
        const remaining = Array.from(siteMap.values());
        const csv = stringifySiteCsv(remaining);
        const creator = sessionUser?.username || sessionUser?.email || "crawler-admin";
        await saveSiteMap(csv, "site_directory_cleanup.csv", creator);

        await logAudit(
            "SITE_REMOVED_BY_ADMIN",
            `Removed ${removedCount} empty/errant site(s) from authoritative Site Directory: ${Array.from(removeSet).join(", ")}.`,
            sessionUser?.id,
            sessionUser?.ipAddress
        );

        return { removedCount, remainingSites: remaining };
    }

    return { removedCount: 0, remainingSites: Array.from(siteMap.values()) };
}


