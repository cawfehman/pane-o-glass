import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { NetscalerGraylogClient, DEFAULT_CITRIX_IOC_RULES, NetscalerIocRule } from "@/lib/netscaler-graylog";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'netscaler'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { rules, range = 86400 } = body;

        const client = new NetscalerGraylogClient();
        const rulesToScan: NetscalerIocRule[] = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_CITRIX_IOC_RULES;

        const findings = await client.scanIocs(rulesToScan, range);

        return NextResponse.json({ findings });
    } catch (error: any) {
        console.error("NetScaler IOC Scan API Error:", error);
        return NextResponse.json(
            { error: "Failed to execute Citrix 0-day IOC scan", details: error.message },
            { status: 500 }
        );
    }
}
