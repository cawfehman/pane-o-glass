import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { getUserDetails } from '@/lib/ldap';
import { getFailureInsight, parseCalledStationId } from '@/lib/ise';
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
        
        // 3. DUAL-STREAM SAMPLING: Fetch Active Sessions AND Recent Failures
        const psnCounts: Record<string, number> = {};
        const reasonCounts: Record<string, number> = {};
        const ssidCounts: Record<string, number> = {};
        const nestedHeatmap: Record<string, any> = {};
        const siteCounts: Record<string, number> = {};
        const siteFailures: Record<string, number> = {};

        const agent = new https.Agent({ 
            rejectUnauthorized: false 
        });
        const startTime = Date.now();

        // Failure Window: Last 15 minutes
        const now = new Date();
        const fifteenAgo = new Date(now.getTime() - 15 * 60 * 1000);
        const formatTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '');
        const timeStart = formatTime(fifteenAgo);
        const timeEnd = formatTime(now);

        const activeEndpoint = `${url}/admin/API/mnt/Session/ActiveList`;
        const failureEndpoint = `${url}/admin/API/mnt/Failure/All/${timeStart}/${timeEnd}/All/All/All`;

        console.log(`[ISE TRIAGE] Dual-Stream Sampling: ActiveList & Failures`);

        const [activeRes, failureRes] = await Promise.allSettled([
            axios.get(activeEndpoint, { headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" }, httpsAgent: agent, timeout: 20000 }),
            axios.get(failureEndpoint, { headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" }, httpsAgent: agent, timeout: 20000 })
        ]);

        const activeXml = activeRes.status === 'fulfilled' ? activeRes.value.data : '';
        const failureXml = failureRes.status === 'fulfilled' ? failureRes.value.data : '';

        const activeMatches = (activeXml.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || []).slice(0, 80);
        const failureMatches = (failureXml.match(/<failureRecord>([\s\S]*?)<\/failureRecord>/g) || []).slice(0, 40);

        const allProbes = [
            ...activeMatches.map(xml => ({ xml, status: 'success' })),
            ...failureMatches.map(xml => ({ xml, status: 'failure' }))
        ];

        console.log(`[ISE TRIAGE] Probing ${allProbes.length} sessions (Successes: ${activeMatches.length}, Failures: ${failureMatches.length})`);

        await Promise.allSettled(allProbes.map(async ({ xml, status }) => {
            const macMatch = xml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
            if (!macMatch) return;
            const mac = macMatch[1];
            if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) return;

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
                const otherAttrMatch = detailXml.match(/<other_attr_string>(.*?)<\/other_attr_string>/);

                const method = (methodMatch ? methodMatch[1].toLowerCase() : 'unknown').toUpperCase();
                const location = locationMatch ? locationMatch[1] : 'Unknown';
                const nas = nasMatch ? nasMatch[1] : 'Unknown';
                const psn = psnMatch ? psnMatch[1] : 'Unknown';
                let ssid = (ssidMatch && ssidMatch[1] !== 'null') ? ssidMatch[1] : null;

                if (!ssid && otherAttrMatch) {
                    const calledStationMatch = otherAttrMatch[1].match(/Called-Station-ID=.*?:(.*?)(?::|:!:|$)/);
                    if (calledStationMatch) ssid = calledStationMatch[1];
                }

                if (['DOT1X', 'MAB', 'WEBAUTH'].includes(method)) {
                    psnCounts[psn] = (psnCounts[psn] || 0) + 1;
                    
                    const otherAttrs: Record<string, string> = {};
                    if (otherAttrMatch) {
                        otherAttrMatch[1].split(':!:').forEach((pair: string) => {
                            const [k, ...v] = pair.split('=');
                            if (k) otherAttrs[k.trim()] = v.join('=').trim();
                        });
                    }

                    const callingStationId = otherAttrs['Called-Station-ID'] || (detailXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1]) || "";
                    const { ssid: extractedSsid, apName: extractedApName, siteCode: extractedSiteCode } = parseCalledStationId(callingStationId, nas);
                    
                    if (extractedSsid !== "N/A") ssid = extractedSsid;

                    let siteCode = extractedSiteCode;
                    if (siteCode === "N/A") {
                        if (location !== 'Unknown' && location.includes('#')) {
                            siteCode = location.split('#').pop()?.toUpperCase() || 'OTHER';
                        } else if (nas !== 'Unknown' && !nas.match(/^\d/)) {
                            siteCode = nas.substring(0, 3).toUpperCase();
                        } else {
                            siteCode = 'OTHER';
                        }
                    }

                    if (status === 'success') {
                        siteCounts[siteCode] = (siteCounts[siteCode] || 0) + 1;
                    } else {
                        siteFailures[siteCode] = (siteFailures[siteCode] || 0) + 1;
                    }
                    
                    if (!nestedHeatmap[siteCode]) nestedHeatmap[siteCode] = { wireless: {}, wired: {}, nas: nas };
                    
                    const group = ssid ? nestedHeatmap[siteCode].wireless : nestedHeatmap[siteCode].wired;
                    const key = ssid || method;
                    
                    if (!group[key]) group[key] = [];
                    if (group[key].length < 12) {
                        group[key].push({ mac, status });
                    }
                    
                    reasonCounts[method] = (reasonCounts[method] || 0) + 1;
                    if (ssid) ssidCounts[ssid] = (ssidCounts[ssid] || 0) + 1;
                }
            } catch (err) {}
        }));

        const hotlist = Object.entries(nestedHeatmap)
            .map(([site, data]: [string, any]) => {
                const successes = siteCounts[site] || 0;
                const failures = siteFailures[site] || 0;
                const total = successes + failures;
                const health = total > 0 ? Math.round((successes / total) * 100) : 100;
                
                return {
                    identity: site,
                    displayName: `Site: ${site}`,
                    count: total,
                    successRate: health,
                    latestTimestamp: new Date().toISOString(),
                    reason: "Unified Forensic Snapshot",
                    nas: data.nas,
                    wireless: data.wireless,
                    wired: data.wired
                };
            })
            .sort((a, b) => b.count - a.count);

        // Forensic Audit Logging
        console.log(`[FORENSIC AUDIT] User: ${session?.user?.email} | Action: ISE_Triage_Dashboard`);

        return NextResponse.json({ 
            found: hotlist.length > 0, 
            hotlist: hotlist.slice(0, 20),
            stats: {
                total: Object.values(siteCounts).reduce((a, b) => a + b, 0),
                failures: Object.values(siteFailures).reduce((a, b) => a + b, 0),
                topReason: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "RADIUS",
                topSsid: Object.entries(ssidCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A",
                topLocation: hotlist[0]?.identity || "None",
            },
            psnDistribution: psnCounts,
            ssidDistribution: ssidCounts,
            siteDistribution: siteCounts,
            authDistribution: reasonCounts,
            processingTime: `${Date.now() - startTime}ms`
        });
    } catch (e: any) {
        console.error(`[ISE TRIAGE ERROR]:`, e);
        return NextResponse.json({ error: "ISE Forensic Synchronization Failure" }, { status: 500 });
    }
}
