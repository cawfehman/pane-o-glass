import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { getIseUrls, executeWithPanFailover } from '@/lib/ise';
import { getCurrentSiteMap } from '@/lib/sites';
import axios from 'axios';
import https from 'https';

interface CacheEntry {
    data: any;
    timestamp: number;
}

let triageCache: CacheEntry | null = null;
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ise'))) {
            return NextResponse.json({ error: 'Identity Access Denied (ISE Role Required)' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const forceRefresh = searchParams.get('refresh') === 'true';
        const targetSite = searchParams.get('site')?.toUpperCase();

        // Return cached payload if valid and not explicitly refreshing
        if (!forceRefresh && !targetSite && triageCache && Date.now() - triageCache.timestamp < CACHE_TTL) {
            return NextResponse.json({ ...triageCache.data, cached: true, ageMs: Date.now() - triageCache.timestamp });
        }

        const { basicAuth } = getIseUrls();
        const agent = new https.Agent({ rejectUnauthorized: false });
        const siteMap = await getCurrentSiteMap();

        const getXml = async (endpoint: string) => {
            try {
                const { data } = await executeWithPanFailover(async (baseUrl) => {
                    const res = await axios.get(`${baseUrl}${endpoint}`, {
                        headers: { 'Authorization': `Basic ${basicAuth}`, 'Accept': 'application/xml', 'X-ERS-Internal-User': 'true' },
                        httpsAgent: agent,
                        timeout: 8000
                    });
                    return res.data;
                });
                return await parseStringPromise(data, { explicitArray: false });
            } catch (err: any) {
                console.warn(`[ISE TRIAGE] XML Error on ${endpoint}:`, err.message);
                return null;
            }
        };

        const getJson = async (endpoint: string) => {
            try {
                const { data } = await executeWithPanFailover(async (baseUrl) => {
                    const res = await axios.get(`${baseUrl}${endpoint}`, {
                        headers: { 'Authorization': `Basic ${basicAuth}`, 'Accept': 'application/json' },
                        httpsAgent: agent,
                        timeout: 8000
                    });
                    return res.data;
                });
                return data;
            } catch (err: any) {
                console.warn(`[ISE TRIAGE] JSON Error on ${endpoint}:`, err.message);
                return null;
            }
        };

        // Parallel Query Execution
        const [
            activeCountXml,
            profilerCountXml,
            postureCountXml,
            versionXml,
            networkDevicesPage1,
            networkDevicesPage2,
            endpointGroupsRes,
            endpointsRes,
            sgtRes,
            failureReasonsXml
        ] = await Promise.all([
            getXml('/admin/API/mnt/Session/ActiveCount'),
            getXml('/admin/API/mnt/Session/ProfilerCount'),
            getXml('/admin/API/mnt/Session/PostureCount'),
            getXml('/admin/API/mnt/Version'),
            getJson('/ers/config/networkdevice?size=100&page=1'),
            getJson('/ers/config/networkdevice?size=100&page=2'),
            getJson('/ers/config/endpointgroup?size=100'),
            getJson('/api/v1/endpoint?size=50'),
            getJson('/api/v1/trustsec/security-group'),
            getXml('/admin/API/mnt/FailureReasons')
        ]);

        // 1. Process Pulse Telemetry
        const activeSessions = parseInt(activeCountXml?.sessionCount?.count || '0', 10);
        const profiledEndpoints = parseInt(profilerCountXml?.sessionCount?.count || '0', 10);
        const posturedEndpoints = parseInt(postureCountXml?.sessionCount?.count || '0', 10);
        const version = versionXml?.product?.version || '3.5.0';

        // 2. Process Endpoint Groups
        const rawGroups = endpointGroupsRes?.SearchResult?.resources || [];
        const groupMap: Record<string, string> = {};
        const endpointGroups = rawGroups.map((g: any) => {
            groupMap[g.id] = g.name;
            return {
                id: g.id,
                name: g.name,
                description: g.description || ''
            };
        });

        // 3. Process Live Endpoints
        const rawEndpoints = Array.isArray(endpointsRes) ? endpointsRes : (endpointsRes?.response || []);
        const recentEndpoints = rawEndpoints.map((ep: any) => ({
            id: ep.id,
            mac: ep.mac || ep.name || '',
            ipAddress: ep.ipAddress || 'DHCP / Dynamic',
            identityGroup: groupMap[ep.groupId] || 'Default',
            profile: ep.profileId || 'Standard Profile'
        }));

        // 4. Process Network Devices & Map to Sites (Option A)
        const allDevicesRaw = [
            ...(networkDevicesPage1?.SearchResult?.resources || []),
            ...(networkDevicesPage2?.SearchResult?.resources || [])
        ];

        const siteBuckets: Record<string, any> = {};

        allDevicesRaw.forEach((dev: any) => {
            const name: string = dev.name || '';
            const desc: string = dev.description || '';
            
            // Extract Site Code prefix (e.g. "3CP-1SC-SWI-1" -> "3CP", "CUH-..." -> "CUH")
            let code = 'OTHER';
            const prefixMatch = name.match(/^([A-Za-z0-9]+)[-_]/);
            if (prefixMatch) {
                code = prefixMatch[1].toUpperCase();
            } else if (name.length >= 3 && !name.match(/^\d/)) {
                code = name.substring(0, 3).toUpperCase();
            }

            if (!siteBuckets[code]) {
                const meta = siteMap.get(code);
                siteBuckets[code] = {
                    siteCode: code,
                    siteName: meta?.name || desc || `Site: ${code}`,
                    siteAddress: meta?.address || 'Address telemetry unavailable',
                    isUnknownSite: !meta,
                    deviceCount: 0,
                    devices: []
                };
            }

            siteBuckets[code].deviceCount += 1;
            siteBuckets[code].devices.push({
                id: dev.id,
                name: dev.name,
                description: desc,
                type: name.includes('SWI') ? 'Switch' : (name.includes('WLC') ? 'Wireless Controller' : 'Network Device')
            });
        });

        const sortedSites = Object.values(siteBuckets).sort((a: any, b: any) => b.deviceCount - a.deviceCount);

        // Filter if target site requested
        const displayedSites = targetSite 
            ? sortedSites.filter((s: any) => s.siteCode === targetSite)
            : sortedSites;

        // 5. Process TrustSec SGT Tags (Option C)
        const rawSgt = sgtRes?.response || [];
        const sgtTags = rawSgt.map((s: any) => ({
            tag: s.tag,
            name: s.name,
            description: s.description || ''
        })).sort((a: any, b: any) => a.tag - b.tag);

        // 6. Process Failure Intelligence (Option C)
        const rawReasons = failureReasonsXml?.failureReasonList?.failureReason || [];
        const reasonsArr = Array.isArray(rawReasons) ? rawReasons : [rawReasons];
        const failureCatalog = reasonsArr.slice(0, 40).map((r: any) => ({
            id: r.id || (typeof r === 'object' ? r['$']?.id : '') || '',
            code: r.code || '',
            cause: r.cause || '',
            resolution: r.resolution || ''
        }));

        const payload = {
            found: true,
            pulse: {
                activeSessions,
                profiledEndpoints,
                posturedEndpoints,
                version,
                totalManagedDevices: allDevicesRaw.length,
                totalIdentityGroups: rawGroups.length,
                totalSgtTags: sgtTags.length,
                timestamp: new Date().toISOString()
            },
            infrastructure: {
                totalSites: sortedSites.length,
                totalDevices: allDevicesRaw.length,
                sites: displayedSites
            },
            deviceIdentity: {
                totalGroups: rawGroups.length,
                groups: endpointGroups,
                recentEndpoints
            },
            trustSec: {
                totalTags: sgtTags.length,
                tags: sgtTags
            },
            failureIntelligence: {
                totalCatalogued: reasonsArr.length,
                catalog: failureCatalog
            }
        };

        // Cache global query
        if (!targetSite) {
            triageCache = {
                data: payload,
                timestamp: Date.now()
            };
        }

        return NextResponse.json(payload);

    } catch (e: any) {
        console.error('[ISE TRIAGE] Critical Route Error:', e);
        return NextResponse.json({ error: e.message || 'Failed to aggregate Cisco ISE 3.5 telemetry' }, { status: 500 });
    }
}
