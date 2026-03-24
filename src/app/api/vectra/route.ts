import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { 
    getVectraHosts, 
    getVectraDetections, 
    getVectraAccounts, 
    searchVectraMetadata 
} from "@/lib/vectra";
import { hasPermission } from "@/app/actions/permissions";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any).role;
    const canAccess = await hasPermission(role, 'vectra');
    if (!canAccess && role !== 'ADMIN') {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'hosts';
    const query = searchParams.get('query') || '';
    const hostId = searchParams.get('host_id');
    const highRiskOnly = searchParams.get('high_risk_only') === 'true';
    const ordering = searchParams.get('ordering') || '-threat';

    try {
        let data;
        switch (type) {
            case 'detections':
                data = await getVectraDetections(hostId ? { host_id: hostId } : { name: query });
                break;
            case 'accounts':
                data = await getVectraAccounts({ name: query, ordering });
                break;
            case 'metadata':
                data = await searchVectraMetadata(query);
                break;
            case 'hosts':
            default:
                data = await getVectraHosts({ 
                    name: query, 
                    highRiskOnly, 
                    ordering: query ? undefined : '-threat' // Sort by threat if not searching by name
                });
                break;
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
