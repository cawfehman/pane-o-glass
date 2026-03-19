import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseStringPromise } from 'xml2js';
import { hasPermission } from "@/app/actions/permissions";

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
        
        // Use uppercase MAC if it's a MAC
        if (isMac) searchTerm = searchTerm.toUpperCase().replace(/-/g, ":");

        const endpoint = `${url}/admin/API/mnt/TACACS/AuthStatus/${endpointType}/${searchTerm}/86400/${limit}/All`;

        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/xml"
            }
        });

        if (!response.ok) {
            if (response.status === 404) return NextResponse.json({ found: false, failures: [] });
            throw new Error(`ISE MnT API Error: ${response.status}`);
        }

        const xml = await response.text();
        
        // Robust parsing matching RADIUS implementation
        const result = await parseStringPromise(xml, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });

        // The MnT XML nodes for TACACS
        const rawList = result?.tacacsAuthStatusOutputList?.tacacsAuthStatusList || 
                         result?.tacacsAuthStatusList || 
                         result?.tacacsAuthStatus || 
                         null;

        if (!rawList) {
            return NextResponse.json({ found: false, failures: [] });
        }

        const nodesArray = Array.isArray(rawList) ? rawList : [rawList];
        
        // We might need to drill down into tacacsAuthStatusElements
        const normalizedList = nodesArray.flatMap((n: any) => {
            const elements = n.tacacsAuthStatusElements || n;
            return Array.isArray(elements) ? elements : [elements];
        }).map((node: any) => {
            const val = (v: any) => v?._ || v || "";

            return {
                timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                user_name: val(node.user_name) || val(node.userName) || "Unknown",
                calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || "Unknown",
                nas_ip_address: val(node.nas_ip_address) || val(node.nasIpAddress) || "Unknown",
                nas_port_id: val(node.nas_port_id) || val(node.nasPortId) || "Unknown",
                failure_reason: val(node.failure_reason) || val(node.failureReason) || "Access Granted",
                failure_id: val(node.failure_id) || val(node.failureId) || "N/A",
                status: val(node.passed) === "true" || node.passed === true,
                acs_server: val(node.acs_server) || val(node.acsServer) || "Unknown",
                nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown",
                privilege_level: val(node.privilege_level) || val(node.privilegeLevel) || "N/A",
                command_set: val(node.command_set) || val(node.commandSet) || "N/A",
                authorization_rule: val(node.authorization_rule) || val(node.authorizationRule) || "Unknown",
                identity_store: val(node.identity_store) || val(node.identityStore) || "Internal"
            };
        });

        // Sorted by timestamp
        const sortedList = normalizedList.sort((a: any, b: any) => {
            const dateA = new Date(a.timestamp as any || 0).getTime();
            const dateB = new Date(b.timestamp as any || 0).getTime();
            return dateB - dateA;
        });

        return NextResponse.json({ 
            found: sortedList.length > 0, 
            failures: sortedList 
        });

    } catch (e: any) {
        console.error("TACACS API Error:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
