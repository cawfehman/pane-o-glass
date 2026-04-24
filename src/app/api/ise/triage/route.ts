import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { getUserDetails } from '@/lib/ldap';
import { getFailureInsight } from '@/lib/ise';

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ise'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const url = process.env.ISE_PAN_URL;
        const user = process.env.ISE_API_USER;
        const pass = process.env.ISE_API_PASSWORD;

        if (!url || !user || !pass) {
            throw new Error("ISE Credentials not configured");
        }

        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        
        // 3. PERFORMANCE OPTIMIZATION: 5-minute 'Live Signal' window for stability
        const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/All/300/40/All`;
        const startTime = Date.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s absolute timeout for stability

        try {
            const response = await fetch(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                signal: controller.signal,
                cache: 'no-store' // Ensure we always get live data
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Triage Feed Unavailable: Service node role restriction.");
                }
                throw new Error(`ISE MnT API Error: ${response.status}`);
            }

            const xmlText = await response.text();
            if (!xmlText || xmlText.length < 50) {
                return NextResponse.json({ found: false, failures: [], totalInSample: 0 });
            }

            const data = await parseStringPromise(xmlText, { 
                explicitArray: false,
                tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
            });
            
            const container = data.authStatusOutputList?.authStatusList || data.authStatusList;
            const rawNodes = container?.authStatus;
            
            if (!rawNodes) {
                return NextResponse.json({ found: false, failures: [], totalInSample: 0 });
            }
            
            const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
            
            const mappedResults = nodesArray
                .map((n: any) => {
                    const node = n.authStatusElements || n;
                    const val = (v: any) => v?._ || v || "";

                    const userName = val(node.user_name) || val(node.userName);
                    const mac = val(node.calling_station_id) || val(node.callingStationId);
                    const passedVal = val(node.passed);
                    const failureReason = val(node.failure_reason) || val(node.failureReason);
                    const failureId = val(node.failure_id) || val(node.failureId);
                    
                    const isSuccess = passedVal === "true" || passedVal === true || (!failureReason && passedVal !== "false");

                    return {
                        timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                        user_name: userName || "Unknown",
                        calling_station_id: mac || "Unknown",
                        failure_reason: failureReason || (isSuccess ? "Passed" : "Unknown Failure"),
                        failure_id: failureId,
                        insight: isSuccess ? null : getFailureInsight(failureId),
                        status: isSuccess,
                        nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown"
                    };
                })
                .filter(res => res.calling_station_id !== "Unknown" || res.user_name !== "Unknown");

            const failuresOnly = mappedResults.filter(f => !f.status);
            
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
                // SSID (often in other_attr_string but we'll approximate from what we have)
                // In a real scenario we'd parse this more deeply
                const ssid = "CooperEmployee"; // Default placeholder for now as per logs
                ssidCounts[ssid] = (ssidCounts[ssid] || 0) + 1;

                const reason = f.insight?.cause || f.failure_reason;
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

                // Site Code: Strictly first 3 characters as per physical location convention
                const location = f.nas_identifier && f.nas_identifier !== "Unknown" 
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

        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                return NextResponse.json({ error: "ISE Triage Timeout: The monitoring database is under heavy load. Please try again in a few seconds." }, { status: 504 });
            }
            throw error;
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to synchronize forensics" }, { status: 500 });
    }
}
