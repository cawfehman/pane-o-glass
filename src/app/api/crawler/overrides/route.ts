import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";
import { removeDirectorySites } from "@/lib/sites";

export function normalizeHostname(h?: string | null): string {
    if (!h) return "";
    return h.split(".")[0].split("(")[0].trim().toLowerCase();
}

let schemaEnsured = false;
async function ensureOverrideSchema() {
    if (schemaEnsured) return;
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "CrawlerDeviceOverride" (
                "hostname" TEXT NOT NULL PRIMARY KEY,
                "rawHostname" TEXT,
                "ipAddress" TEXT,
                "tag" TEXT NOT NULL DEFAULT 'CUSTOM',
                "siteOverride" TEXT,
                "idfOverride" TEXT,
                "roleOverride" TEXT,
                "reason" TEXT,
                "excludeFromTopology" BOOLEAN NOT NULL DEFAULT false,
                "excludeFromFailures" BOOLEAN NOT NULL DEFAULT false,
                "createdBy" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "siteOverride" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "idfOverride" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "roleOverride" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "rawHostname" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "tag" TEXT DEFAULT 'CUSTOM'`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "reason" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "excludeFromTopology" BOOLEAN DEFAULT false`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "excludeFromFailures" BOOLEAN DEFAULT false`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CrawlerDeviceOverride_tag_idx" ON "CrawlerDeviceOverride"("tag")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CrawlerDeviceOverride_siteOverride_idx" ON "CrawlerDeviceOverride"("siteOverride")`);
        schemaEnsured = true;
    } catch (err) {
        console.warn("[CrawlerOverrides] Schema auto-ensure warning:", err);
    }
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        await ensureOverrideSchema();

        const overrides = await prisma.crawlerDeviceOverride.findMany({
            orderBy: { updatedAt: "desc" }
        });

        return NextResponse.json(overrides);
    } catch (error: any) {
        console.error("Failed to fetch crawler device overrides:", error);
        return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        await ensureOverrideSchema();

        const body = await request.json();
        
        // Support either a single hostname or a list of hostnames for bulk override
        let hostnames: string[] = [];
        if (Array.isArray(body.hostnames) && body.hostnames.length > 0) {
            hostnames = body.hostnames.map((h: any) => String(h).trim()).filter(Boolean);
        } else if (body.hostname) {
            hostnames = [String(body.hostname).trim()];
        }

        if (hostnames.length === 0) {
            return NextResponse.json({ error: "At least one device hostname is required." }, { status: 400 });
        }

        const siteOverride = body.siteOverride !== undefined 
            ? (body.siteOverride ? String(body.siteOverride).trim().toUpperCase() : null)
            : undefined;
        const idfOverride = body.idfOverride !== undefined
            ? (body.idfOverride ? String(body.idfOverride).trim().toUpperCase() : null)
            : undefined;
        const roleOverride = body.roleOverride !== undefined
            ? (body.roleOverride ? String(body.roleOverride).trim() : null)
            : undefined;

        const isSiteIdfEdit = Boolean(siteOverride || idfOverride || roleOverride);

        const defaultTag = isSiteIdfEdit ? "CUSTOM" : "VENDOR_MANAGED";
        const tag = (body.tag || defaultTag).toUpperCase();
        const reason = body.reason || body.notes || (isSiteIdfEdit ? "Non-standard naming convention override" : null);
        const excludeFromTopology = body.excludeFromTopology !== undefined ? Boolean(body.excludeFromTopology) : false;
        const excludeFromFailures = body.excludeFromFailures !== undefined ? Boolean(body.excludeFromFailures) : false;
        const username = session?.user?.name || (session?.user as any)?.username || "admin";
        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "internal";

        const savedOverrides: any[] = [];

        for (const rawHost of hostnames) {
            const normHost = normalizeHostname(rawHost);
            if (!normHost) continue;

            const override = await prisma.crawlerDeviceOverride.upsert({
                where: { hostname: normHost },
                create: {
                    hostname: normHost,
                    rawHostname: rawHost,
                    ipAddress: body.ipAddress || null,
                    tag,
                    siteOverride: siteOverride ?? null,
                    idfOverride: idfOverride ?? null,
                    roleOverride: roleOverride ?? null,
                    reason,
                    excludeFromTopology,
                    excludeFromFailures,
                    createdBy: username
                },
                update: {
                    rawHostname: rawHost,
                    ipAddress: body.ipAddress || undefined,
                    tag,
                    siteOverride: siteOverride,
                    idfOverride: idfOverride,
                    roleOverride: roleOverride,
                    reason,
                    excludeFromTopology: body.excludeFromTopology !== undefined ? Boolean(body.excludeFromTopology) : undefined,
                    excludeFromFailures: body.excludeFromFailures !== undefined ? Boolean(body.excludeFromFailures) : undefined,
                    createdBy: username
                }
            });

            // Update existing CrawlDevice records for this device
            const crawlUpdateData: any = {};
            if (siteOverride !== undefined) crawlUpdateData.site = siteOverride;
            if (idfOverride !== undefined) crawlUpdateData.idf = idfOverride;
            if (roleOverride !== undefined) crawlUpdateData.role = roleOverride;

            if (Object.keys(crawlUpdateData).length > 0) {
                try {
                    await prisma.crawlDevice.updateMany({
                        where: {
                            OR: [
                                { hostname: { equals: rawHost, mode: "insensitive" } },
                                { hostname: { startsWith: normHost, mode: "insensitive" } }
                            ]
                        },
                        data: crawlUpdateData
                    });
                } catch (dbErr) {
                    console.warn(`Could not update crawlDevice records for ${rawHost}:`, dbErr);
                }
            }

            savedOverrides.push(override);
        }

        // Optional errant site cleanup (e.g. if 'WLC' was created and now has 0 devices)
        const siteToClean = typeof body.cleanupEmptySite === "string" 
            ? body.cleanupEmptySite 
            : (body.cleanupEmptySite && body.formerSite ? body.formerSite : null);

        if (siteToClean) {
            const emptySite = String(siteToClean).trim().toUpperCase();
            try {
                // Check if any devices remain in this site
                const remainingDevs = await prisma.crawlDevice.count({
                    where: { site: emptySite }
                });
                if (remainingDevs === 0) {
                    await removeDirectorySites([emptySite], session?.user as any);
                }
            } catch (cleanErr) {
                console.warn(`Failed cleaning up empty site ${emptySite}:`, cleanErr);
            }
        }

        await logAudit(
            "CRAWLER_OVERRIDE_SET",
            `Configured node override for ${savedOverrides.length} device(s) [${hostnames.join(", ")}]: Site=${siteOverride || "N/A"}, IDF=${idfOverride || "N/A"}, Role=${roleOverride || "N/A"}, Tag=${tag}${reason ? `, Reason: "${reason}"` : ""}`,
            (session?.user as any)?.id,
            clientIp
        );

        return NextResponse.json({
            success: true,
            count: savedOverrides.length,
            overrides: savedOverrides
        });
    } catch (error: any) {
        console.error("Failed to save crawler device override:", error);
        return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        await ensureOverrideSchema();

        const { searchParams } = new URL(request.url);
        const hostParam = searchParams.get("hostname");
        if (!hostParam) {
            return NextResponse.json({ error: "Hostname parameter is required." }, { status: 400 });
        }

        const normHost = normalizeHostname(hostParam);
        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "internal";

        await prisma.crawlerDeviceOverride.deleteMany({
            where: { hostname: normHost }
        });

        await logAudit(
            "CRAWLER_OVERRIDE_REMOVE",
            `Removed governance override for device '${normHost}'`,
            (session?.user as any)?.id,
            clientIp
        );

        return NextResponse.json({ success: true, removed: normHost });
    } catch (error: any) {
        console.error("Failed to delete crawler device override:", error);
        return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
    }
}
