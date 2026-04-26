import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { getUserDetails } from '@/lib/ldap';
import { getFailureInsight } from '@/lib/ise';
import axios from 'axios';
import https from 'https';

export async function GET(req: Request) {
    try {
        const session = await auth();
        console.log(`[ISE TRIAGE] Initiating forensic sync for user: ${session?.user?.email || 'Anonymous'}`);
        
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ise'))) {
            console.warn(`[ISE TRIAGE] Permission denied for role: ${role}`);
            return NextResponse.json({ error: 'Identity Access Denied (ISE Role Required)' }, { status: 403 });
        }

        const rawUrl = process.env.ISE_PAN_URL;
        const rawUser = process.env.ISE_API_USER;
        const rawPass = process.env.ISE_API_PASSWORD;

        if (!rawUrl || !rawUser || !rawPass) {
            console.error(`[ISE TRIAGE] Configuration missing. URL: ${!!rawUrl}, User: ${!!rawUser}, Pass: ${!!rawPass}`);
            throw new Error("ISE MnT API Credentials not configured in .env");
        }

        // Quote-Resilience: Strip leading/trailing double quotes that might be in the .env file
        const urlClean = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
        const user = rawUser.replace(/^"|"$/g, '');
        const pass = rawPass.replace(/^"|"$/g, '');
        const url = urlClean;

        console.log(`[ISE TRIAGE] Using Cleaned URL: ${url}`);
        console.log(`[ISE TRIAGE] User: ${user} (Length: ${user.length})`);
        // No trim - use exactly what is in .env
        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        
        // 3. PERFORMANCE OPTIMIZATION: Use ActiveList for Global Triage
        // In Patch 7, AuthStatus Global is broken, but ActiveList returns 14k+ records in seconds
        const endpoint = `${url}/admin/API/mnt/Session/ActiveList`;
        const agent = new https.Agent({ rejectUnauthorized: false });
        const startTime = Date.now();

        console.log(`[ISE TRIAGE] Fetching Active Session List from: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml",
                "X-ERS-Internal-User": "true"
            },
            httpsAgent: agent,
            timeout: 30000,
            proxy: false
        });

        if (response.status !== 200) {
            throw new Error(`ISE MnT API Unavailable (HTTP ${response.status})`);
        }

        const xmlText = response.data;
        
        // Use high-speed regex to parse the 14,000 sessions (much faster than XML DOM)
        const sessionMatches = xmlText.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        console.log(`[ISE TRIAGE] Processing ${sessionMatches.length} active sessions.`);

        const siteCounts: Record<string, number> = {};
        const psnCounts: Record<string, number> = {};
        const userSites: Record<string, string[]> = {}; // For site-based drill down

        sessionMatches.forEach((sessionXml: string) => {
            // Extract key fields using optimized regex
            const serverMatch = sessionXml.match(/<server>(.*?)<\/server>/);
            const wlcMatch = sessionXml.match(/<network_device_name>(.*?)<\/network_device_name>/) || sessionXml.match(/<nas_ip_address>(.*?)<\/nas_ip_address>/);
            const userMatch = sessionXml.match(/<user_name>(.*?)<\/user_name>/);
            const macMatch = sessionXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);

            const server = serverMatch ? serverMatch[1] : 'Unknown';
            const wlc = wlcMatch ? wlcMatch[1] : 'Unknown';
            const user = userMatch ? userMatch[1] : 'Unknown';
            const mac = macMatch ? macMatch[1] : 'Unknown';

            psnCounts[server] = (psnCounts[server] || 0) + 1;

            // Site Code: First 3 letters of WLC (e.g., KEL, CAM, RIV)
            const siteCode = wlc !== 'Unknown' ? wlc.substring(0, 3).toUpperCase() : 'OTHER';
            siteCounts[siteCode] = (siteCounts[siteCode] || 0) + 1;

            if (!userSites[siteCode]) userSites[siteCode] = [];
            if (userSites[siteCode].length < 5) {
                userSites[siteCode].push(user !== 'Unknown' ? user : mac);
            }
        });

        const duration = Date.now() - startTime;
        
        // Map to a format the Dashboard expects, or provide new high-level stats
        const hotlist = Object.entries(siteCounts)
            .map(([site, count]) => ({
                identity: site,
                displayName: `Site: ${site}`,
                count: count,
                latestTimestamp: new Date().toISOString(),
                reason: "Active Connections",
                nas: site,
                topUsers: userSites[site]
            }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({ 
            found: sessionMatches.length > 0, 
            failures: [], // ActiveList doesn't have failures, but we'll show active load
            hotlist: hotlist.slice(0, 20),
            stats: {
                total: sessionMatches.length,
                failures: 0, // Placeholder
                topReason: "High Connection Volume",
                topSsid: "CHS-Wireless (Est)",
                topLocation: hotlist[0]?.identity || "None",
                rate: 0
            },
            psnDistribution: psnCounts,
            processingTime: `${duration}ms`
        });
        const successCount = mappedResults.length - failuresOnly.length;
        
        console.log(`[ISE TRIAGE] Sample Analysis: ${mappedResults.length} Total Events | ${successCount} Successes | ${failuresOnly.length} Failures`);
        
        // Group by User/Device for "Hotlist"
        const hotlistMap: Record<string, any> = {};
        failuresOnly.forEach(f => {
            const key = f.user_name !== "Unknown" ? f.user_name : f.calling_station_id;
            if (!hotlistMap[key]) {
                hotlistMap[key] = {
                    identity: key,
                    displayName: f.user_name,
                    mac: f.calling_station_id,
                    count: 0,
                    latestTimestamp: f.timestamp,
                    reason: f.failure_reason,
                    insight: f.insight,
                    nas: f.nas_identifier
                };
            }
            hotlistMap[key].count++;
            if (new Date(f.timestamp) > new Date(hotlistMap[key].latestTimestamp)) {
                hotlistMap[key].latestTimestamp = f.timestamp;
            }
        });

        const hotlist = Object.values(hotlistMap).sort((a, b) => b.count - a.count);
        
        // Forensic Analytics
        const ssidCounts: Record<string, number> = {};
        const reasonCounts: Record<string, number> = {};
        const locationCounts: Record<string, number> = {};

        failuresOnly.forEach(f => {
            const ssid = f.wlan_ssid && f.wlan_ssid !== "N/A" ? f.wlan_ssid : "Unknown SSID";
            ssidCounts[ssid] = (ssidCounts[ssid] || 0) + 1;

            const reason = f.insight?.cause || f.failure_reason;
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

            // Site Code: First 3 characters of the AP name or WLC hostname
            const location = f.nas_identifier && f.nas_identifier !== "N/A" && f.nas_identifier !== "Unknown" 
                ? f.nas_identifier.substring(0, 3).toUpperCase() 
                : "Unknown";
            locationCounts[location] = (locationCounts[location] || 0) + 1;
        });

        const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";
        const topSsid = Object.entries(ssidCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";
        const topLocation = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

        const duration = Date.now() - startTime;

        return NextResponse.json({ 
            found: mappedResults.length > 0, 
            failures: failuresOnly.slice(0, 30),
            hotlist,
            stats: {
                total: mappedResults.length,
                failures: failuresOnly.length,
                topReason,
                topSsid,
                topLocation,
                rate: mappedResults.length ? Math.round((failuresOnly.length / mappedResults.length) * 100) : 0
            },
            processingTime: `${duration}ms`
        });

    } catch (e: any) {
        console.error(`[ISE TRIAGE] Critical Error:`, e);
        return NextResponse.json({ error: e.message || "Failed to synchronize forensics" }, { status: 500 });
    }
}
