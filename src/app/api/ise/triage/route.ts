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
        
        // 3. PERFORMANCE OPTIMIZATION: Try both 'API' and 'api' paths (ISE 3.3 casing quirk)
        const pathsToTest = [
            `${url}/admin/API/mnt/AuthStatus/LastNRecords/All/50/All`,
            `${url}/admin/api/mnt/AuthStatus/LastNRecords/All/50/All`
        ];

        let lastResponse: any = null;
        let lastEndpoint = "";
        const agent = new https.Agent({ rejectUnauthorized: false });

        for (const endpoint of pathsToTest) {
            console.log(`[ISE TRIAGE] Testing Endpoint (Axios-Final): ${endpoint}`);
            
            try {
                const response = await axios.get(endpoint, {
                    headers: { 
                        "Authorization": `Basic ${basicAuth}`, 
                        "Accept": "application/xml",
                        "X-ERS-Internal-User": "true",
                        "X-Requested-With": "XMLHttpRequest",
                        "User-Agent": "axios/1.6.2"
                    },
                    httpsAgent: agent,
                    timeout: 15000,
                    proxy: false,
                    validateStatus: () => true
                });
                
                if (response.status === 200) {
                    lastResponse = response;
                    lastEndpoint = endpoint;
                    break;
                }
                lastResponse = response;
                lastEndpoint = endpoint;
            } catch (err: any) {
                console.error(`[ISE TRIAGE] Axios failed for ${endpoint}:`, err.message);
            }
        }

        if (!lastResponse || lastResponse.status !== 200) {
            const status = lastResponse?.status || "TIMEOUT";
            const server = lastResponse?.headers['server'] || 'Unknown Proxy';
            throw new Error(`ISE MnT API Unavailable (HTTP ${status}). Server Type: ${server}. Path: ${lastEndpoint}`);
        }

        const response = lastResponse;
        const endpoint = lastEndpoint;
        const startTime = Date.now();

        const xmlText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        console.log(`[ISE TRIAGE] Raw Response Snippet (First 500 chars): ${xmlText.substring(0, 500)}`);

        if (!xmlText || xmlText.length < 50) {
            return NextResponse.json({ found: false, failures: [], stats: { total: 0 } });
        }

        // HTML INTERCEPTION CHECK: If the server returned HTML (e.g. from a proxy/F5), stop and report
        if (xmlText.trim().toLowerCase().startsWith('<!doctype html') || xmlText.trim().toLowerCase().startsWith('<html')) {
            const server = response.headers['server'] || 'Unknown Proxy';
            const titleMatch = xmlText.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : 'No Title';
            
            console.error(`[ISE TRIAGE] Intercepted by HTML: "${title}" from ${server}`);
            throw new Error(`ISE MnT API Intercepted by "${title}" (${server}): The server returned an HTML page. This usually means a proxy is blocking the path.`);
        }

        const data = await parseStringPromise(xmlText, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });
        
        // Tag-Agnostic Node Discovery: Scan for authStatus nodes anywhere in the tree
        const findNodes = (obj: any): any[] => {
            if (!obj || typeof obj !== 'object') return [];
            if (obj.authStatus) return Array.isArray(obj.authStatus) ? obj.authStatus : [obj.authStatus];
            
            for (const key in obj) {
                const found = findNodes(obj[key]);
                if (found.length > 0) return found;
            }
            return [];
        };

        const rawNodes = findNodes(data);
        console.log(`[ISE TRIAGE] Discovered ${rawNodes.length} raw authentication nodes.`);
        
        if (rawNodes.length === 0) {
            return NextResponse.json({ found: false, failures: [], stats: { total: 0 } });
        }
        
        const mappedResults = rawNodes
            .map((n: any) => {
                const node = n.authStatusElements || n;
                const val = (v: any) => v?._ || v || "";

                // Deep Parse Attributes
                const otherAttrString = val(node.other_attr_string) || val(node.otherAttrString) || "";
                const otherAttrs: Record<string, string> = {};
                if (otherAttrString) {
                    otherAttrString.split(':!:').forEach(attr => {
                        const [k, v] = attr.split('=');
                        if (k && v) otherAttrs[k] = v;
                    });
                }

                const userName = val(node.user_name) || val(node.userName);
                const mac = val(node.calling_station_id) || val(node.callingStationId);
                const passedVal = val(node.passed);
                const failureReason = val(node.failure_reason) || val(node.failureReason);
                const failureId = val(node.failure_id) || val(node.failureId);
                
                const isSuccess = passedVal === "true" || passedVal === true || (!failureReason && passedVal !== "false");

                // Extract SSID and AP from Called-Station-ID
                const calledStationId = otherAttrs['Called-Station-ID'] || val(node.called_station_id) || "";
                let extractedSsid = "N/A";
                let extractedApIdentity = val(node.network_device_name) || otherAttrs['NAS-Identifier'] || "N/A";

                if (calledStationId.includes(':')) {
                    const parts = calledStationId.split(':');
                    extractedSsid = parts.pop() || "N/A";
                    const firstPart = parts.join(':');
                    if (firstPart) extractedApIdentity = firstPart;
                }

                return {
                    timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                    user_name: userName || "Unknown",
                    calling_station_id: mac || "Unknown",
                    failure_reason: failureReason || (isSuccess ? "Passed" : "Unknown Failure"),
                    failure_id: failureId,
                    insight: isSuccess ? null : getFailureInsight(failureId),
                    status: isSuccess,
                    nas_identifier: extractedApIdentity,
                    wlan_ssid: extractedSsid
                };
            })
            .filter(res => res.calling_station_id !== "Unknown" || res.user_name !== "Unknown");

        const failuresOnly = mappedResults.filter(f => !f.status);
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
