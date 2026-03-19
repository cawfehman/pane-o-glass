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
            
            // Basic Cisco ISE Syslog Parser
            const extract = (key: string) => {
                const match = msg.match(new RegExp(`${key}=(.*?)(,|\\s|$)`));
                return match ? match[1] : "Unknown";
            };

            // Detect Status based on Cisco Tag
            let status = 'Unknown';
            if (msg.includes('Passed')) status = 'Passed';
            if (msg.includes('Failed')) status = 'Failed';

            return {
                timestamp: entry.timestamp,
                user_name: extract('User-Name') || extract('User') || "Unknown",
                calling_station_id: extract('Remote-Address') || extract('Address') || entry.source,
                nas_ip_address: extract('NAS-IP-Address') || entry.source,
                server: extract('ConfigServiceNode') || entry.source || "ISE-Cluster",
                status: status,
                nas_port_id: extract('NAS-Port') || "N/A",
                failure_reason: status === 'Failed' ? "Authentication Denied" : "Success"
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
