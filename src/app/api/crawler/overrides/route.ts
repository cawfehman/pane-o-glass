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

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const body = await request.json();
        const rawHost = (body.hostname || "").trim();
        const normHost = normalizeHostname(rawHost);

        if (!normHost) {
            return NextResponse.json({ error: "Device hostname is required." }, { status: 400 });
        }

        const tag = (body.tag || "VENDOR_MANAGED").toUpperCase();
        const reason = body.reason || body.notes || null;
        const excludeFromTopology = body.excludeFromTopology !== undefined ? Boolean(body.excludeFromTopology) : true;
        const excludeFromFailures = body.excludeFromFailures !== undefined ? Boolean(body.excludeFromFailures) : false;
        const ipAddress = body.ipAddress || null;
        const username = session?.user?.name || (session?.user as any)?.username || "admin";
        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0] || "internal";

        const override = await prisma.crawlerDeviceOverride.upsert({
            where: { hostname: normHost },
            create: {
                hostname: normHost,
                rawHostname: rawHost,
                ipAddress,
                tag,
                reason,
                excludeFromTopology,
                excludeFromFailures,
                createdBy: username
            },
            update: {
                rawHostname: rawHost,
                ipAddress: ipAddress || undefined,
                tag,
                reason,
                excludeFromTopology,
                excludeFromFailures,
                createdBy: username
            }
        });

        await logAudit(
            "CRAWLER_OVERRIDE_SET",
            `Configured governance override for device '${normHost}': Tag=${tag}, ExcludeTopology=${excludeFromTopology}, ExcludeFailures=${excludeFromFailures}${reason ? `, Reason: "${reason}"` : ""}`,
            (session?.user as any)?.id,
            clientIp
        );

        return NextResponse.json(override);
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
