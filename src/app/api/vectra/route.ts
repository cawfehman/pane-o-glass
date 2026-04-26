import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { 
    getVectraHosts, 
    getVectraDetections, 
    getVectraAccounts, 
    getVectraHostDetails,
    getVectraAccountDetails,
    searchVectraMetadata 
} from "@/lib/vectra";
import { hasPermission } from "@/app/actions/permissions";

import { z } from "zod";

const VectraQuerySchema = z.object({
    type: z.enum(['hosts', 'accounts', 'detections', 'metadata', 'host_details', 'account_details']).default('hosts'),
    query: z.string().max(255).optional().default(''),
    host_id: z.string().regex(/^[0-9]+$/).optional(),
    account_id: z.string().regex(/^[0-9]+$/).optional(),
    high_risk_only: z.preprocess((val) => val === 'true', z.boolean()).default(true),
    ordering: z.string().max(50).optional().default('-t_score')
});

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any).role;
    const canAccess = await hasPermission(role, 'vectra');
    if (!canAccess && role !== 'ADMIN') {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const params = Object.fromEntries(searchParams.entries());
        const validated = VectraQuerySchema.safeParse(params);

        if (!validated.success) {
            return NextResponse.json({ error: "Invalid request parameters", details: validated.error.format() }, { status: 400 });
        }

        const { type, query, host_id, account_id, high_risk_only, ordering } = validated.data;

        // Forensic Audit Logging (Simulated - would go to a DB in production)
        console.log(`[FORENSIC AUDIT] User: ${session.user?.email} | Action: Vectra_${type} | Query: ${query}`);

        let data;
        switch (type) {
            case 'detections':
                data = await getVectraDetections({ 
                    host_id: host_id || undefined, 
                    name: query || undefined 
                });
                break;
            case 'accounts':
                data = await getVectraAccounts({ name: query, ordering });
                break;
            case 'metadata':
                data = await searchVectraMetadata(query);
                break;
            case 'host_details':
                if (!host_id) throw new Error("host_id required");
                data = await getVectraHostDetails(host_id);
                break;
            case 'account_details':
                if (!account_id) throw new Error("account_id required");
                data = await getVectraAccountDetails(account_id);
                break;
            case 'hosts':
            default:
                data = await getVectraHosts({ 
                    name: query, 
                    highRiskOnly: high_risk_only, 
                    ordering: query ? undefined : '-t_score'
                });
                break;
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[VECTRA API ERROR]:", error);
        return NextResponse.json({ error: "Vectra Service Communication Failure" }, { status: 500 });
    }
}
