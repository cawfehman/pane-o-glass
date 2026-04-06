import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { getUserDetails } from '@/lib/ldap';

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
                    
                    const isSuccess = passedVal === "true" || passedVal === true || (!failureReason && passedVal !== "false");

                    return {
                        timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                        user_name: userName || "Unknown",
                        calling_station_id: mac || "Unknown",
                        failure_reason: failureReason || (isSuccess ? "Passed" : "Unknown Failure"),
                        status: isSuccess,
                        nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown"
                    };
                })
                .filter(res => res.calling_station_id !== "Unknown" || res.user_name !== "Unknown");

            const failuresOnly = mappedResults.filter(f => !f.status);
            const duration = Date.now() - startTime;

            return NextResponse.json({ 
                found: mappedResults.length > 0, 
                failures: failuresOnly.slice(0, 20),
                totalInSample: mappedResults.length,
                failureCount: failuresOnly.length,
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
