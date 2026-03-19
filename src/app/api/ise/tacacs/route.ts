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
        let timeWindow = "604800"; // 7 days default

        // Handle Recent Activity vs Specific Search
        if (!query || query.toLowerCase() === 'recent') {
            endpointType = 'All';
            searchTerm = '';
        }
        
        if (isMac) searchTerm = searchTerm.toUpperCase().replace(/-/g, ":");

        // Construction per MnT spec
        const endpoint = endpointType === 'All' 
            ? `${url}/admin/API/mnt/TACACS/AuthStatus/All/${timeWindow}/${limit}/All`
            : `${url}/admin/API/mnt/TACACS/AuthStatus/${endpointType}/${searchTerm}/${timeWindow}/${limit}/All`;

        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        const response = await fetch(endpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
        });

        if (!response.ok) {
            if (response.status === 404) return NextResponse.json({ found: false, failures: [] });
            throw new Error(`ISE MnT API Error: ${response.status}`);
        }

        const xml = await response.text();
        
        // Robust parsing with namespace stripping
        const result = await parseStringPromise(xml, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });

        // -------------------------------------------------------------------------
        // RECURSIVE LOG DISCOVERY (v1.6.8)
        // Find any node that looks like an array of TACACS status elements
        // -------------------------------------------------------------------------
        const findLogs = (obj: any): any[] => {
            if (!obj || typeof obj !== 'object') return [];
            
            // Check for known element arrays
            if (obj.tacacsAuthStatusElements) {
                return Array.isArray(obj.tacacsAuthStatusElements) ? obj.tacacsAuthStatusElements : [obj.tacacsAuthStatusElements];
            }
            if (obj.tacacsAuthStatus) {
                return Array.isArray(obj.tacacsAuthStatus) ? obj.tacacsAuthStatus : [obj.tacacsAuthStatus];
            }

            // Recurse into objects
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    const found = findLogs(obj[key]);
                    if (found.length > 0) return found;
                }
            }
            return [];
        };

        let rawNodes = findLogs(result);

        if (rawNodes.length === 0) {
            // Last ditch: if the result ITSELF is an array (xml2js sometimes does this with multiple roots)
            if (Array.isArray(result)) {
                rawNodes = result.flatMap(r => findLogs(r));
            }
        }

        if (rawNodes.length === 0) {
            return NextResponse.json({ found: false, failures: [] });
        }

        const normalizedList = rawNodes.map((node: any) => {
            const val = (v: any) => v?._ || (typeof v === 'string' ? v : "");

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

        // -------------------------------------------------------------------------
        // ROBUST NAN-SAFE SORTING (v1.6.8) - Matching RADIUS implementation
        // -------------------------------------------------------------------------
        const sortedList = normalizedList.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
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
