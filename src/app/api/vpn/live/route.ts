import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

// Cache store to minimize repeated SSH handshakes to edge firewalls
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

let cachedSummary: CacheEntry<any> | null = null;
let cachedPools: CacheEntry<any> | null = null;
let cachedSessions: CacheEntry<any> | null = null;
let inflightSessionsFetch: Promise<any> | null = null;

const TTL_SUMMARY_MS = 25 * 1000; // 25 seconds
const TTL_POOLS_MS = 60 * 1000;   // 60 seconds
const TTL_SESSIONS_MS = 150 * 1000; // 2.5 minutes (Stale-While-Revalidate window)

async function resolvePythonCommand(): Promise<string> {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            await execFileAsync(cmd, ["--version"]);
            return cmd;
        } catch {}
    }
    return process.platform === "win32" ? "python" : "python3";
}

async function runFtdCli(args: string[]): Promise<any> {
    const pythonBin = await resolvePythonCommand();
    const scriptPath = path.join(process.cwd(), "services", "firewall", "ftd_client.py");
    try {
        const { stdout } = await execFileAsync(pythonBin, [scriptPath, "--json", ...args], {
            cwd: process.cwd(),
            timeout: 75000,
            env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        return JSON.parse(stdout);
    } catch (err: any) {
        console.warn("[VPN-LIVE-CLI] Python execution note:", err.message);
        return null;
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action") || "all";
        const query = (searchParams.get("q") || "").trim();
        const firewall = searchParams.get("firewall") || "ra";
        const refresh = searchParams.get("refresh") === "true";
        const now = Date.now();

        // 1. Live Lookup for a specific user or IP address
        if (action === "lookup" || (query && action !== "all")) {
            const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(query);
            const cliArgs = [
                "--action", "ra_sessions",
                "--target", firewall
            ];

            if (isIp) {
                cliArgs.push("--ip", query);
            } else {
                cliArgs.push("--username", query);
            }

            const rawResults = await runFtdCli(cliArgs);
            const liveMatches: any[] = [];

            if (Array.isArray(rawResults)) {
                for (const r of rawResults) {
                    if (r.success && Array.isArray(r.sessions)) {
                        for (const s of r.sessions) {
                            liveMatches.push(s);
                        }
                    }
                }
            }

            return NextResponse.json({
                success: true,
                query,
                isLiveActive: liveMatches.length > 0,
                activeCount: liveMatches.length,
                sessions: liveMatches,
                timestamp: new Date().toISOString()
            });
        }

        // 2. Summary Request
        if (action === "summary") {
            if (!refresh && cachedSummary && (now - cachedSummary.timestamp) < TTL_SUMMARY_MS) {
                return NextResponse.json({ ...cachedSummary.data, cached: true });
            }

            const raw = await runFtdCli(["--action", "ra_summary", "--target", firewall]);
            const gateways = Array.isArray(raw) ? raw : [];
            
            // Distinguish Active vs Standby nodes to prevent double-counting replicated sessions
            const activeGateways = gateways.filter((g) => g.haRole === "ACTIVE" || (!g.haRole && (g.activeAnyConnect || 0) > 0));
            const standbyGateways = gateways.filter((g) => g.haRole === "STANDBY");

            const totalActive = activeGateways.reduce((acc, g) => acc + (g.activeAnyConnect || 0), 0);
            const totalStandbySynced = standbyGateways.reduce((acc, g) => acc + (g.standbyAnyConnect || 0), 0);
            const totalPeak = activeGateways.reduce((acc, g) => acc + (g.peakAnyConnect || 0), 0);
            const totalCapacity = activeGateways.reduce((acc, g) => acc + (g.deviceCapacity || 10000), 0);

            const data = {
                success: true,
                totalActive,
                totalStandbySynced,
                totalPeak,
                totalCapacity,
                gateways,
                timestamp: new Date().toISOString()
            };

            cachedSummary = { data, timestamp: now };
            return NextResponse.json(data);
        }

        // 3. Pools Request
        if (action === "pools") {
            if (!refresh && cachedPools && (now - cachedPools.timestamp) < TTL_POOLS_MS) {
                return NextResponse.json({ ...cachedPools.data, cached: true });
            }

            const raw = await runFtdCli(["--action", "ra_pools", "--target", firewall]);
            const pools: any[] = [];
            if (Array.isArray(raw)) {
                for (const r of raw) {
                    if (r.success && Array.isArray(r.pools)) {
                        pools.push(...r.pools);
                    }
                }
            }

            // Deduplicate across HA pairs by poolName to avoid doubling cluster subnet capacity
            const uniquePoolsMap = new Map<string, any>();
            for (const p of pools) {
                if (!uniquePoolsMap.has(p.poolName)) {
                    uniquePoolsMap.set(p.poolName, p);
                }
            }
            const clusterPools = Array.from(uniquePoolsMap.values());

            const totalIps = clusterPools.reduce((acc, p) => acc + (p.totalIps || 0), 0);
            const usedIps = clusterPools.reduce((acc, p) => acc + (p.usedIps || 0), 0);
            const freeIps = clusterPools.reduce((acc, p) => acc + (p.freeIps || 0), 0);
            const utilizationPercent = totalIps > 0 ? Number(((usedIps / totalIps) * 100).toFixed(1)) : 0;

            const data = {
                success: true,
                pools,
                summary: {
                    totalIps,
                    usedIps,
                    freeIps,
                    utilizationPercent
                },
                timestamp: new Date().toISOString()
            };

            cachedPools = { data, timestamp: now };
            return NextResponse.json(data);
        }

        // 4. Full Sessions List (Stale-While-Revalidate Engine)
        if (action === "sessions") {
            const isFresh = cachedSessions && (now - cachedSessions.timestamp) < TTL_SESSIONS_MS;

            // 1. If fresh cache exists and not forced refresh, return immediately (<10ms)
            if (!refresh && isFresh) {
                return NextResponse.json({ ...cachedSessions!.data, cached: true });
            }

            // Function to perform the live multi-firewall retrieval and deduplication
            const doFetch = async () => {
                const raw = await runFtdCli(["--action", "ra_sessions", "--target", firewall]);
                const sessions: any[] = [];
                if (Array.isArray(raw)) {
                    for (const r of raw) {
                        if (r.success && Array.isArray(r.sessions)) {
                            sessions.push(...r.sessions);
                        }
                    }
                }

                // Deduplicate across HA / load-balanced cluster members
                const seen = new Set<string>();
                const deduplicated: any[] = [];
                for (const s of sessions) {
                    const key = s.auditSessionId ? `${s.auditSessionId}` : `${s.username}-${s.assignedIp || s.publicIp}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        deduplicated.push(s);
                    }
                }

                // Sort by throughput (highest traffic first)
                deduplicated.sort((a, b) => ((b.bytesTx || 0) + (b.bytesRx || 0)) - ((a.bytesTx || 0) + (a.bytesRx || 0)));

                const result = {
                    success: true,
                    totalSessions: deduplicated.length,
                    sessions: deduplicated,
                    timestamp: new Date().toISOString()
                };

                cachedSessions = { data: result, timestamp: Date.now() };
                return result;
            };

            // 2. If we have existing cached data (even if stale) and not forced, return immediately (<10ms)
            // and trigger background revalidation without blocking the user
            if (!refresh && cachedSessions) {
                if (!inflightSessionsFetch) {
                    inflightSessionsFetch = doFetch().finally(() => {
                        inflightSessionsFetch = null;
                    });
                }
                return NextResponse.json({ ...cachedSessions.data, cached: true, stale: true });
            }

            // 3. Cold start or forced refresh: await retrieval or join inflight fetch
            if (inflightSessionsFetch) {
                const data = await inflightSessionsFetch;
                return NextResponse.json(data);
            }

            inflightSessionsFetch = doFetch().finally(() => {
                inflightSessionsFetch = null;
            });
            const data = await inflightSessionsFetch;
            return NextResponse.json(data);
        }

        // 5. Default "all" dashboard package (combines summary + pools in parallel)
        const [summaryRes, poolsRes] = await Promise.all([
            (!refresh && cachedSummary && (now - cachedSummary.timestamp) < TTL_SUMMARY_MS)
                ? Promise.resolve(cachedSummary.data)
                : runFtdCli(["--action", "ra_summary", "--target", firewall]).then(raw => {
                    const gateways = Array.isArray(raw) ? raw : [];
                    const totalActive = gateways.reduce((acc, g) => acc + (g.activeAnyConnect || 0), 0);
                    const totalPeak = gateways.reduce((acc, g) => acc + (g.peakAnyConnect || 0), 0);
                    const totalCapacity = gateways.reduce((acc, g) => acc + (g.deviceCapacity || 10000), 0);
                    const d = { success: true, totalActive, totalPeak, totalCapacity, gateways, timestamp: new Date().toISOString() };
                    cachedSummary = { data: d, timestamp: now };
                    return d;
                }),
            (!refresh && cachedPools && (now - cachedPools.timestamp) < TTL_POOLS_MS)
                ? Promise.resolve(cachedPools.data)
                : runFtdCli(["--action", "ra_pools", "--target", firewall]).then(raw => {
                    const pools: any[] = [];
                    if (Array.isArray(raw)) {
                        for (const r of raw) {
                            if (r.success && Array.isArray(r.pools)) pools.push(...r.pools);
                        }
                    }
                    const totalIps = pools.reduce((acc, p) => acc + (p.totalIps || 0), 0);
                    const usedIps = pools.reduce((acc, p) => acc + (p.usedIps || 0), 0);
                    const freeIps = pools.reduce((acc, p) => acc + (p.freeIps || 0), 0);
                    const utilizationPercent = totalIps > 0 ? Number(((usedIps / totalIps) * 100).toFixed(1)) : 0;
                    const d = { success: true, pools, summary: { totalIps, usedIps, freeIps, utilizationPercent }, timestamp: new Date().toISOString() };
                    cachedPools = { data: d, timestamp: now };
                    return d;
                })
        ]);

        return NextResponse.json({
            success: true,
            summary: summaryRes,
            pools: poolsRes,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error("[VPN-LIVE-API] Error:", err);
        return NextResponse.json({
            success: false,
            error: err.message || "Failed to retrieve live VPN telemetry"
        }, { status: 500 });
    }
}
