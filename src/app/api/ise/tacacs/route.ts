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
        let timeWindow = "86400"; // 24 hours default

        // If query is empty or "recent", fetch all events
        if (!query || query.toLowerCase() === 'recent') {
            endpointType = 'All';
            searchTerm = ''; // All endpoint does NOT use a searchTerm segment
            timeWindow = "604800"; // 7 days
        }
        
        // Use uppercase MAC if it's a MAC
        if (isMac) searchTerm = searchTerm.toUpperCase().replace(/-/g, ":");

        // The MnT specification: 
        // /admin/API/mnt/TACACS/AuthStatus/All/{time}/{number}/All
        // vs
        // /admin/API/mnt/TACACS/AuthStatus/{type}/{id}/{time}/{number}/All
        const endpoint = endpointType === 'All' 
            ? `${url}/admin/API/mnt/TACACS/AuthStatus/All/${timeWindow}/${limit}/All`
            : `${url}/admin/API/mnt/TACACS/AuthStatus/${endpointType}/${searchTerm}/${timeWindow}/${limit}/All`;

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
        
        // DEBUG HACK: Write raw XML to a file in the workspace so we can inspect it
        try {
            const fs = require('fs');
            const path = require('path');
            const debugPath = path.join(process.cwd(), 'debug_tacacs.xml');
            fs.writeFileSync(debugPath, `URL: ${endpoint}\n\n${xml}`);
        } catch (e) {
            console.error("Failed to write debug XML:", e);
        }
        
        // Robust parsing matching RADIUS implementation
        const result = await parseStringPromise(xml, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });

        // Broaden discovery for TACACS nodes
        const rawList = result?.tacacsAuthStatusOutputList?.tacacsAuthStatusList || 
                         result?.tacacsAuthStatusList?.tacacsAuthStatusElements ||
                         result?.tacacsAuthStatusList || 
                         result?.tacacsAuthStatus || 
                         result?.tacacsAuthStatusOutputList ||
                         null;

        if (!rawList) {
            return NextResponse.json({ found: false, failures: [] });
        }

        let nodesArray = Array.isArray(rawList) ? rawList : (rawList.tacacsAuthStatusElements ? (Array.isArray(rawList.tacacsAuthStatusElements) ? rawList.tacacsAuthStatusElements : [rawList.tacacsAuthStatusElements]) : [rawList]);
        
        const normalizedList = nodesArray.flatMap((n: any) => {
            if (!n) return [];
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
