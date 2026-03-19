import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession } from '@/lib/ise';

export async function GET(request: Request) {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session?.user || !(await hasPermission(role, 'ise-tacacs'))) {
        return NextResponse.json({ error: 'Forbidden: Access to this tool is restricted.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || "";
    const limit = searchParams.get('limit') || "25";

    try {
        const url = process.env.ISE_PAN_URL;
        const user = process.env.ISE_API_USER;
        const pass = process.env.ISE_API_PASSWORD;

        if (!url || !user || !pass) {
            throw new Error("ISE Credentials not configured in .env");
        }

        const isMac = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query);
        let endpointType = isMac ? 'MACAddress' : 'User';
        let searchTerm = query;

        // If query is empty or "recent", fetch all events
        if (!query || query.toLowerCase() === 'recent') {
            endpointType = 'All';
            searchTerm = 'All';
        }
        
        // For TACACS, we query the TACACS AuthStatus endpoint
        const endpoint = `${url}/admin/API/mnt/TACACS/AuthStatus/${endpointType}/${searchTerm}/86400/${limit}/All`;

        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
                'Accept': 'application/xml',
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json({ found: false, failures: [] });
            }
            throw new Error(`ISE MnT API returned ${response.status}`);
        }

        const xml = await response.text();
        const result = await parseStringPromise(xml);

        // MnT XML structure for TACACS is similar to RADIUS but with different node names
        const list = result?.tacacsAuthStatusOutputList?.tacacsAuthStatusList?.[0]?.tacacsAuthStatusElements || 
                    result?.tacacsAuthStatusOutputList?.tacacsAuthStatusList || 
                    [];

        // Normalize the list
        const normalizedList = (Array.isArray(list) ? list : [list]).flatMap((node: any) => {
            // Handle nested tacacsAuthStatusElements if it's an array
            const elements = node.tacacsAuthStatusElements || [node];
            return Array.isArray(elements) ? elements : [elements];
        }).map((node: any) => {
            const raw = node;
            const getValue = (paths: string[]) => {
                for (const path of paths) {
                    if (raw[path] && raw[path][0]) {
                        if (typeof raw[path][0] === 'object' && raw[path][0]._) return raw[path][0]._;
                        return raw[path][0];
                    }
                }
                return "Unknown";
            };

            return {
                timestamp: getValue(['acs_timestamp', 'acsTimestamp']),
                status: getValue(['passed', 'Passed']) === 'true' || getValue(['passed', 'Passed']) === true,
                failure_reason: getValue(['failure_reason', 'failureReason']),
                user_name: getValue(['user_name', 'userName']),
                calling_station_id: getValue(['calling_station_id', 'callingStationId']),
                nas_ip_address: getValue(['nas_ip_address', 'networkDeviceIpAddress']),
                nas_port_id: getValue(['nas_port_id', 'nasPortId']),
                nas_identifier: getValue(['nas_identifier', 'networkDeviceName']),
                authorization_rule: getValue(['authorization_rule', 'authorizationRule']),
                privilege_level: getValue(['privilege_level', 'privilegeLevel']),
                acs_server: getValue(['acs_server', 'acsServer']),
                failure_id: getValue(['status_id', 'statusId']),
                // TACACS specific fields
                command_set: getValue(['command_set', 'commandSet']),
                identity_store: getValue(['identity_store', 'identityStore']),
            };
        });

        const sortedList = normalizedList.sort((a: any, b: any) => {
            const dateA = new Date(a.timestamp as any || 0).getTime();
            const dateB = new Date(b.timestamp as any || 0).getTime();
            return dateB - dateA; // Descending
        });

        await logAudit(session.user.email, 'ISE_TACACS_LOOKUP', `Queried TACACS logs for: ${query}`);

        return NextResponse.json({
            found: sortedList.length > 0,
            failures: sortedList
        });

    } catch (error: any) {
        console.error("[ISE-TACACS-ERROR]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
