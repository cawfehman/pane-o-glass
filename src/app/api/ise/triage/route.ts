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
        
        // 3. Fetch the most recent records using the 3.3-compatible MACAddress/All path
        const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/All/3600/100/All`;
        const startTime = Date.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s absolute timeout

        try {
            const response = await fetch(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`ISE MnT API Error: ${response.status}`);
            }

            const xmlText = await response.text();
            const data = await parseStringPromise(xmlText, { 
                explicitArray: false,
                tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
            });
            
            const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
            if (!rawNodes) {
                return NextResponse.json({ found: false, failures: [], totalInSample: 0 });
            }
            
            const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
            
            // 4. Map results WITHOUT LDAP enrichment for speed (Drill-down will enrich)
            const mappedResults = nodesArray.map((n: any) => {
                const node = n.authStatusElements || n;
                const val = (v: any) => v?._ || v || "";

                const userName = val(node.user_name) || val(node.userName);
                const passedVal = val(node.passed);
                const failureReason = val(node.failure_reason) || val(node.failureReason);
                
                const isSuccess = passedVal === "true" || passedVal === true || (!failureReason && passedVal !== "false");

                return {
                    timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                    user_name: userName || "Unknown",
                    calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || "Unknown",
                    failure_reason: failureReason || (isSuccess ? "Passed" : "Unknown Failure"),
                    status: isSuccess,
                    nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown"
                };
            });

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
                throw new Error("ISE Triage timeout: Monitoring node response delayed.");
            }
            throw error;
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
