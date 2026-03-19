import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const LOG_DIR = path.join(process.cwd(), 'logs');
        const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');

        if (!fs.existsSync(BUFFER_PATH)) {
            return NextResponse.json({ 
                found: false, 
                message: "Syslog buffer not found. Ensure collector is running.",
                sessions: [] 
            });
        }

        const rawData = fs.readFileSync(BUFFER_PATH, 'utf8');
        const buffer = JSON.parse(rawData);

        // Normalize Syslog Entries to Dashboard UI format
        const normalizedList = buffer.map((entry: any) => {
            const msg = entry.raw;
            
            // Refined Cisco ISE Syslog Parser
            const extract = (key: string) => {
                const match = msg.match(new RegExp(`${key}=(.*?)(,|\\s|$)`));
                return match ? match[1].trim() : "";
            };

            // Status Heatmap (v2.7.2)
            // Cisco use various tags for success: Passed, Authorized, Granted, Accounting
            const isExplicitFail = msg.includes('Failed') || msg.includes('Denied') || msg.includes('Rejected');
            const isExplicitPass = msg.includes('Passed') || msg.includes('Authorized') || msg.includes('Granted') || msg.includes('Accounting') || msg.includes('Success');

            let status = 'Unknown';
            if (isExplicitFail) status = 'Failed';
            else if (isExplicitPass) status = 'Passed';
            else status = 'Passed'; // Default to Passed for informational/benign logs

            // Extract NAS / Server identifiers
            const server = extract('ConfigServiceNode') || entry.source || "ISE-Cluster";
            const nasIp = extract('NAS-IP-Address') || entry.source;
            const nasName = extract('Device-Name') || extract('NAS-Identifier') || "Network Device";

            return {
                timestamp: entry.timestamp,
                user_name: extract('User-Name') || extract('User') || "Unknown",
                calling_station_id: extract('Remote-Address') || extract('Address') || entry.source,
                nas_ip_address: nasIp,
                server: server,
                status: status,
                nas_port_id: extract('NAS-Port') || "N/A",
                failure_reason: status === 'Failed' ? "Authentication Denied" : "Success",
                device_name: nasName
            };
        });

        return NextResponse.json({ 
            found: true, 
            sessions: normalizedList,
            count: normalizedList.length
        });

    } catch (error: any) {
        console.error("TACACS Ingestion Error:", error);
        return NextResponse.json({ error: error.message, sessions: [] }, { status: 500 });
    }
}
