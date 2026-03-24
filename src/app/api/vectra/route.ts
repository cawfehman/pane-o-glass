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
    const ordering = searchParams.get('ordering') || '-t_score';

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
            case 'host_details':
                data = await getVectraHostDetails(hostId!);
                break;
            case 'account_details':
                data = await getVectraAccountDetails(searchParams.get('account_id')!);
                break;
            case 'hosts':
            default:
                data = await getVectraHosts({ 
                    name: query, 
                    highRiskOnly, 
                    ordering: query ? undefined : '-t_score'
                });
                break;
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
