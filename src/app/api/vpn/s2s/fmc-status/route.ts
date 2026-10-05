import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { FmcClient } from "@/lib/fmc-client";

export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || "USER";

        if (!session?.user || !(await hasPermission(role, "vpn-s2s"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const fmc = new FmcClient();
        const testRes = await fmc.testConnection();
        const devices = await fmc.getDeviceRecords();

        return NextResponse.json({
            isConfigured: fmc.isReady(),
            testResult: testRes,
            devices,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
