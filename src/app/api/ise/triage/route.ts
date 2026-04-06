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
        
        // 3. Fetch all auth status records for the last 24 hours, limited to 100 results
        const endpoint = `${url}/admin/API/mnt/AuthStatus/All/86400/100/All`;
        const response = await fetch(endpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
        });

        if (!response.ok) {
            throw new Error(`ISE MnT API Error: ${response.status}`);
        }

        const xmlText = await response.text();
        const data = await parseStringPromise(xmlText, { 
            explicitArray: false,
            tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
        });
        
        // Debug Log for Triage
        console.log(`ISE Triage: Received ${xmlText.length} bytes of XML from MnT.`);

        const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
        if (!rawNodes) {
            console.warn("ISE Triage: No AuthStatus nodes found in MnT response.");
            return NextResponse.json({ found: false, failures: [] });
        }
        
        const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
        
        // 4. Map and enrich with robust parsing
        const mappedResults = await Promise.all(nodesArray.map(async (n: any) => {
            const node = n.authStatusElements || n;
            const val = (v: any) => v?._ || v || "";

            const userName = val(node.user_name) || val(node.userName);
            const passedVal = val(node.passed);
            const failureReason = val(node.failure_reason) || val(node.failureReason);
            
            // Robust status check: handles "true", true, or empty reason
            const isSuccess = passedVal === "true" || passedVal === true || (!failureReason && passedVal !== "false");

            return {
                timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || "Unknown",
                user_name: userName || "Unknown",
                calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || "Unknown",
                failure_reason: failureReason || (isSuccess ? "Passed" : "Unknown Failure"),
                status: isSuccess,
                nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown",
                ad: userName && userName !== "Unknown" ? await getUserDetails(userName) : null
            };
        }));

        const failuresOnly = mappedResults.filter(f => !f.status);

        return NextResponse.json({ 
            found: mappedResults.length > 0, 
            failures: failuresOnly.slice(0, 20),
            totalInSample: mappedResults.length,
            failureCount: failuresOnly.length
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
