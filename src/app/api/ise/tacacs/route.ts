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
            
            // Quotation-Aware Cisco ISE Syslog Parser (v2.9.1)
            const extract = (key: string) => {
                const quotedMatch = msg.match(new RegExp(`${key}="(.*?)"`));
                if (quotedMatch) return quotedMatch[1].trim();
                const simpleMatch = msg.match(new RegExp(`${key}=(.*?)(,|\\s|$)`));
                return simpleMatch ? simpleMatch[1].trim() : "";
            };

            // Multi-Key Fallback Logic (v2.9.1)
            const extractAny = (keys: string[]) => {
                for (const key of keys) {
                    const val = extract(key);
                    if (val && val !== "N/A") return val;
                }
                return "";
            };

            // Status Heatmap
            const isExplicitFail = msg.includes('Failed') || msg.includes('Denied') || msg.includes('Rejected');
            const isExplicitPass = msg.includes('Passed') || msg.includes('Authorized') || msg.includes('Granted') || msg.includes('Accounting') || msg.includes('Success');

            let status = 'Unknown';
            if (isExplicitFail) status = 'Failed';
            else if (isExplicitPass) status = 'Passed';
            else status = 'Passed'; 

            // High-Fidelity Source Differentiation
            const iseNode = extractAny(['ConfigServiceNode', 'acs_server', 'Server']) || "ISE-Cluster";
            const nasIp = extractAny(['Device-IP-Address', 'NAS-IP-Address', 'Device_IP_Address']) || entry.source || "Unknown";
            const nasName = extractAny(['Device-Name', 'NetworkDeviceName', 'Network_Device_Name', 'NAS-Identifier', 'nas-name']) || "Network Device";
            const adminIp = extractAny(['Remote-Address', 'Address', 'Calling-Station-ID']) || entry.source || "Unknown";

            return {
                timestamp: entry.timestamp || new Date().toISOString(),
                user_name: extractAny(['User-Name', 'User', 'Admin-User']) || "Unknown",
                calling_station_id: adminIp,
                nas_ip_address: nasIp,
                server: iseNode,
                status: status,
                nas_port_id: extract('NAS-Port') || "N/A",
                failure_reason: status === 'Failed' ? "Authentication Denied" : "Success",
                device_name: nasName,
                
                // Deep Forensics
                command_set: extract('Command-String') || "N/A",
                privilege_level: extract('Privilege-Level') || "15",
                authen_type: extract('Authen-Type') || "Unknown",
                authen_method: extract('Authen-Method') || "Unknown",
                service: extract('Service') || "Unknown",
                identity_group: extractAny(['Identity-Group', 'User-Identity-Group']) || "Default",
                shell_profile: extract('Shell-Profile') || "Default",
                raw_message: msg
            };
        });

        // Server-Side Search Filter
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
