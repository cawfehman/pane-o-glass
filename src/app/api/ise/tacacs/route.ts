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

        // -------------------------------------------------------------------------
        // ISE 3.3 TRANSITION: Session/ActiveList Integration (v1.9.0)
        // Since AuthStatus (forensics) returns 404 for TACACS in this cluster,
        // we leverage the validated ActiveList which provides real-time visibility.
        // -------------------------------------------------------------------------
        const activeListEndpoint = `${url}/admin/API/mnt/Session/ActiveList?service=TACACS`;
        
        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        const response = await fetch(activeListEndpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
        });

        if (!response.ok) {
            throw new Error(`ISE MnT Session API Error: ${response.status}`);
        }

        const xml = await response.text();
        
        const result = await parseStringPromise(xml, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });

        // -------------------------------------------------------------------------
        // RECURSIVE SESSION DISCOVERY (v1.9.0)
        // -------------------------------------------------------------------------
        const findSessions = (obj: any): any[] => {
            if (!obj || typeof obj !== 'object') return [];
            
            if (obj.activeSession) {
                return Array.isArray(obj.activeSession) ? obj.activeSession : [obj.activeSession];
            }

            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    const found = findSessions(obj[key]);
                    if (found.length > 0) return found;
                }
            }
            return [];
        };

        const rawSessions = findSessions(result);

        if (rawSessions.length === 0) {
            return NextResponse.json({ found: false, failures: [] });
        }

        const normalizedList = rawSessions.map((node: any) => {
            const val = (v: any) => v?._ || (typeof v === 'string' ? v : "");

            return {
                timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || new Date().toISOString(),
                user_name: val(node.user_name) || val(node.userName) || "Unknown",
                calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || "Unknown",
                nas_ip_address: val(node.nas_ip_address) || val(node.nasIpAddress) || val(node.framed_ip_address) || "Unknown",
                nas_port_id: val(node.nas_port_id) || val(node.nasPortId) || "N/A",
                failure_reason: "Active Session",
                failure_id: "0",
                status: true, // If it's in the ActiveList, it passed.
                acs_server: val(node.server) || val(node.acsServer) || "Unknown",
                nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown",
                privilege_level: "N/A",
                command_set: "N/A",
                authorization_rule: "Active",
                identity_store: "Internal"
            };
        });

        // Robust sorting by timestamp
        const sortedList = normalizedList.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
        });

        return NextResponse.json({ 
            found: sortedList.length > 0, 
            failures: sortedList.slice(0, parseInt(limit)) 
        });

    } catch (e: any) {
        console.error("TACACS API Error:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
