import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { getS2sConfig, setSessionConfig, clearSessionConfig } from "@/lib/s2s-config";
import { FmcClient } from "@/lib/fmc-client";
import { logAudit } from "@/lib/audit";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { config, isConfigured, source } = getS2sConfig();

        // Return sanitized config (mask passwords)
        const sanitizedFmc = config.fmc ? {
            url: config.fmc.url,
            username: config.fmc.username,
            hasPassword: Boolean(config.fmc.password),
            domainUuid: config.fmc.domainUuid
        } : null;

        const sanitizedFtds = (config.ftds || []).map(f => ({
            id: f.id,
            name: f.name,
            ip: f.ip,
            user: f.user,
            hasPassword: Boolean(f.pass)
        }));

        return NextResponse.json({
            isConfigured,
            source,
            activeMode: config.activeMode || "fmc",
            fmc: sanitizedFmc,
            ftds: sanitizedFtds,
            configuredAt: config.configuredAt,
            configuredBy: config.configuredBy
        });
    } catch (error: any) {
        console.error("Error fetching S2S config:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden: Access to configuration is restricted." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { action = "save", fmc, ftds, activeMode = "fmc", save = true } = body;

        if (action === "clear") {
            clearSessionConfig();
            await logAudit("VPN_S2S_CONFIG_CLEARED", "Cleared in-memory S2S VPN session configuration", session.user.id);
            return NextResponse.json({ success: true, message: "Session configuration cleared." });
        }

        if (action === "test_fmc") {
            if (!fmc?.url || !fmc?.username || !fmc?.password) {
                return NextResponse.json({ error: "FMC URL, username, and password are required for connection test." }, { status: 400 });
            }
            const testClient = new FmcClient({
                baseUrl: fmc.url,
                username: fmc.username,
                password: fmc.password,
                domainUuid: fmc.domainUuid
            });
            const res = await testClient.testConnection();
            return NextResponse.json(res);
        }

        // Validate and apply to ephemeral session memory
        const { config: existing } = getS2sConfig();

        const updatedFmc = fmc ? {
            url: fmc.url?.trim(),
            username: fmc.username?.trim(),
            password: fmc.password || existing.fmc?.password || "",
            domainUuid: fmc.domainUuid?.trim() || existing.fmc?.domainUuid
        } : existing.fmc;

        const updatedFtds = Array.isArray(ftds) ? ftds.map((f: any, idx: number) => ({
            id: f.id || `s2s-ftd-${idx + 1}`,
            name: f.name || f.ip,
            ip: f.ip?.trim(),
            user: f.user?.trim() || "admin",
            pass: f.pass || (existing.ftds?.find(e => e.ip === f.ip)?.pass) || "",
            secret: f.secret || ""
        })) : existing.ftds;

        setSessionConfig({
            fmc: updatedFmc,
            ftds: updatedFtds,
            activeMode
        }, session.user.name || (session.user as any)?.username || "admin");

        await logAudit(
            "VPN_S2S_CONFIG_APPLIED",
            `Applied S2S VPN session config in memory (zero disk writes): Mode=${activeMode}, FMC Host=${updatedFmc?.url || 'none'}, FTDs count=${updatedFtds?.length || 0}`,
            session.user.id
        );

        return NextResponse.json({
            success: true,
            message: "Configuration successfully applied in active session memory.",
            activeMode,
            fmcConfigured: Boolean(updatedFmc?.url),
            ftdsCount: updatedFtds?.length || 0
        });
    } catch (error: any) {
        console.error("Error saving S2S config:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
