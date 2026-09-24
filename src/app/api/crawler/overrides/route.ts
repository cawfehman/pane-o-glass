import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export function normalizeHostname(h?: string | null): string {
    if (!h) return "";
    return h.split(".")[0].split("(")[0].trim().toLowerCase();
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const overrides = await prisma.crawlerDeviceOverride.findMany({
            orderBy: { updatedAt: "desc" }
        });

        return NextResponse.json(overrides);
    } catch (error: any) {
        console.error("Failed to fetch crawler device overrides:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

import { removeDirectorySites } from "@/lib/sites";

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

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

        const siteOverride = body.siteOverride ? String(body.siteOverride).trim().toUpperCase() : null;
        const idfOverride = body.idfOverride ? String(body.idfOverride).trim().toUpperCase() : null;
        const roleOverride = body.roleOverride ? String(body.roleOverride).trim() : null;
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
                    siteOverride,
                    idfOverride,
                    roleOverride,
                    reason,
                    excludeFromTopology,
                    excludeFromFailures,
                    createdBy: username
                },
                update: {
                    rawHostname: rawHost,
                    ipAddress: body.ipAddress || undefined,
                    tag,
                    siteOverride: siteOverride !== undefined ? siteOverride : undefined,
                    idfOverride: idfOverride !== undefined ? idfOverride : undefined,
                    roleOverride: roleOverride !== undefined ? roleOverride : undefined,
                    reason,
                    excludeFromTopology,
                    excludeFromFailures,
                    createdBy: username
                }
            });

            // Update existing CrawlDevice records for this device
            const crawlUpdateData: any = {};
            if (siteOverride) crawlUpdateData.site = siteOverride;
            if (idfOverride) crawlUpdateData.idf = idfOverride;
            if (roleOverride) crawlUpdateData.role = roleOverride;

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
        if (body.cleanupEmptySite) {
            const emptySite = String(body.cleanupEmptySite).trim().toUpperCase();
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
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

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
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
