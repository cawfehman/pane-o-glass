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
        
        // 4. SAMPLING STRATEGY: Since bulk list is sparse and global failures are broken,
        // we probe the first 60 active sessions in parallel to build a high-fidelity "Sampled Heatmap"
        const sampleSize = 60;
        const samples = sessionMatches.slice(0, sampleSize);
        console.log(`[ISE TRIAGE] Deep-probing ${samples.length} sessions for forensic enrichment...`);

        const siteCounts: Record<string, number> = {};
        const psnCounts: Record<string, number> = {};
        const reasonCounts: Record<string, number> = {};
        const ssidCounts: Record<string, number> = {};
        const nestedHeatmap: Record<string, any> = {};

        await Promise.allSettled(samples.map(async (sessionXml: string) => {
            const macMatch = sessionXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
            if (!macMatch) return;
            const mac = macMatch[1];
            
            const isHardwareMac = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
            if (!isHardwareMac) return;

            try {
                const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const detailXml = detailRes.data;
                const methodMatch = detailXml.match(/<authentication_method>(.*?)<\/authentication_method>/);
                const locationMatch = detailXml.match(/<location>(.*?)<\/location>/);
                const nasMatch = detailXml.match(/<network_device_name>(.*?)<\/network_device_name>/);
                const psnMatch = detailXml.match(/<server>(.*?)<\/server>/);
                const ssidMatch = detailXml.match(/<wlan_ssid>(.*?)<\/wlan_ssid>/);

                const method = (methodMatch ? methodMatch[1].toLowerCase() : 'unknown').toUpperCase();
                const location = locationMatch ? locationMatch[1] : 'Unknown';
                const nas = nasMatch ? nasMatch[1] : 'Unknown';
                const psn = psnMatch ? psnMatch[1] : 'Unknown';
                const ssid = ssidMatch ? ssidMatch[1] : null;

                if (['DOT1X', 'MAB', 'WEBAUTH'].includes(method)) {
                    psnCounts[psn] = (psnCounts[psn] || 0) + 1;
                    
                    let siteCode = 'OTHER';
                    if (location !== 'Unknown' && location.includes('#')) {
                        siteCode = location.split('#').pop()?.toUpperCase() || 'OTHER';
                    } else if (nas !== 'Unknown' && !nas.match(/^\d/)) {
                        siteCode = nas.substring(0, 3).toUpperCase();
                    }

                    siteCounts[siteCode] = (siteCounts[siteCode] || 0) + 1;
                    
                    // Nested Grouping: Site -> Type -> SubGroup
                    if (!nestedHeatmap[siteCode]) nestedHeatmap[siteCode] = { wireless: {}, wired: {}, nas: nas };
                    
                    if (ssid) {
                        if (!nestedHeatmap[siteCode].wireless[ssid]) nestedHeatmap[siteCode].wireless[ssid] = [];
                        if (nestedHeatmap[siteCode].wireless[ssid].length < 6) nestedHeatmap[siteCode].wireless[ssid].push(mac);
                    } else {
                        if (!nestedHeatmap[siteCode].wired[method]) nestedHeatmap[siteCode].wired[method] = [];
                        if (nestedHeatmap[siteCode].wired[method].length < 6) nestedHeatmap[siteCode].wired[method].push(mac);
                    }
                    
                    if (!reasonCounts[method]) reasonCounts[method] = 0;
                    reasonCounts[method]++;
                    if (ssid) {
                        if (!ssidCounts[ssid]) ssidCounts[ssid] = 0;
                        ssidCounts[ssid]++;
                    }
                }
            } catch (err) {}
        }));

        const topMethod = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "RADIUS";
        const topSsid = Object.entries(ssidCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

        const duration = Date.now() - startTime;
        
        // Build the Hotlist from our Nested Heatmap
        const hotlist = Object.entries(nestedHeatmap)
            .map(([site, data]: [string, any]) => ({
                identity: site,
                displayName: `Site: ${site}`,
                count: siteCounts[site] || 0,
                latestTimestamp: new Date().toISOString(),
                reason: "Live RADIUS Telemetry",
                nas: data.nas,
                wireless: data.wireless,
                wired: data.wired
            }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({ 
            found: hotlist.length > 0, 
            failures: [], 
            hotlist: hotlist.slice(0, 20),
            stats: {
                total: Object.values(siteCounts).reduce((a, b) => a + b, 0),
                failures: 0,
                topReason: topMethod, // This is the Auth Method (e.g. DOT1X)
                topSsid: topSsid,
                topLocation: hotlist[0]?.identity || "None",
                rate: 0
            },
            psnDistribution: psnCounts,
            ssidDistribution: ssidCounts,
            siteDistribution: siteCounts,
            authDistribution: reasonCounts,
            processingTime: `${duration}ms`
        });
    } catch (e: any) {
        console.error(`[ISE TRIAGE] Critical Error:`, e);
        return NextResponse.json({ error: e.message || "Failed to synchronize forensics" }, { status: 500 });
    }
}
