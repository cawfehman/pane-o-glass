import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('query') || '').toLowerCase();

        const LOG_DIR = path.join(process.cwd(), 'logs');
        const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');

        if (!fs.existsSync(BUFFER_PATH)) {
            return NextResponse.json({ 
                found: false, 
                message: "Syslog buffer not found. Ensure collector is running.",
                sessions: [] 
            });
        }

        let buffer = [];
        try {
            const rawData = fs.readFileSync(BUFFER_PATH, 'utf8');
            buffer = JSON.parse(rawData);
        } catch (parseError) {
            console.error("[RECOVERY] Buffer corrupted, returning empty session list.");
            return NextResponse.json({ found: true, sessions: [], recovering: true });
        }

        // Normalize Syslog Entries to Dashboard UI format
        const normalizedList = buffer.map((entry: any) => {
            const msg = entry.raw || "";
            
            // Quotation-Aware Cisco ISE Syslog Parser (v2.9.0)
            // Handles: key=value OR key="value with spaces"
            const extract = (key: string) => {
                const quotedMatch = msg.match(new RegExp(`${key}="(.*?)"`));
                if (quotedMatch) return quotedMatch[1].trim();
                const simpleMatch = msg.match(new RegExp(`${key}=(.*?)(,|\\s|$)`));
                return simpleMatch ? simpleMatch[1].trim() : "";
            };

            // Status Heatmap
            const isExplicitFail = msg.includes('Failed') || msg.includes('Denied') || msg.includes('Rejected');
            const isExplicitPass = msg.includes('Passed') || msg.includes('Authorized') || msg.includes('Granted') || msg.includes('Accounting') || msg.includes('Success');

            let status = 'Unknown';
            if (isExplicitFail) status = 'Failed';
            else if (isExplicitPass) status = 'Passed';
            else status = 'Passed'; 

            // Source Differentiation
            const iseNode = extract('ConfigServiceNode') || "ISE-Cluster";
            const nasIp = extract('Device-IP-Address') || extract('NAS-IP-Address') || entry.source || "Unknown";
            const nasName = extract('Device-Name') || extract('NAS-Identifier') || "Network Device";
            const adminIp = extract('Remote-Address') || extract('Address') || entry.source || "Unknown";

            return {
                timestamp: entry.timestamp || new Date().toISOString(),
                user_name: extract('User-Name') || extract('User') || "Unknown",
                calling_station_id: adminIp,
                nas_ip_address: nasIp,
                server: iseNode,
                status: status,
                nas_port_id: extract('NAS-Port') || "N/A",
                failure_reason: status === 'Failed' ? "Authentication Denied" : "Success",
                device_name: nasName,
                
                // Ultra-Deep Forensics (v2.9.0)
                command_set: extract('Command-String') || "N/A",
                privilege_level: extract('Privilege-Level') || "15",
                authen_type: extract('Authen-Type') || "Unknown",
                authen_method: extract('Authen-Method') || "Unknown",
                service: extract('Service') || "Unknown",
                identity_group: extract('Identity-Group') || "Default",
                shell_profile: extract('Shell-Profile') || "Default",
                raw_message: msg
            };
        });

        // Server-Side Search Filter (v2.9.0)
        let filteredList = normalizedList;
        if (query && query !== 'recent') {
            filteredList = normalizedList.filter((s: any) => 
                s.user_name.toLowerCase().includes(query) ||
                s.nas_ip_address.toLowerCase().includes(query) ||
                s.device_name.toLowerCase().includes(query) ||
                s.command_set.toLowerCase().includes(query) ||
                s.raw_message.toLowerCase().includes(query)
            );
        }

        // Return latest events first
        filteredList.reverse();

        return NextResponse.json({ 
            found: true, 
            sessions: filteredList,
            count: filteredList.length
        });

    } catch (error: any) {
        console.error("TACACS Ingestion Error:", error);
        return NextResponse.json({ error: error.message, sessions: [] }, { status: 500 });
    }
}
