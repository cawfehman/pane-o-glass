import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('query') || '').toLowerCase();
        const windowParam = searchParams.get('window') || '1h'; // 15m, 1h, 12h, 24h, 7d

        const LOG_DIR = path.join(process.cwd(), 'logs');
        const BUFFER_PATH = path.join(LOG_DIR, 'tacacs-recent.json');

        if (!fs.existsSync(LOG_DIR)) {
            return NextResponse.json({ found: false, sessions: [], message: "Log directory not found." });
        }

        // --- Time Threshold Calculation ---
        const now = new Date();
        const getThreshold = (window: string) => {
            const val = parseInt(window);
            if (window.endsWith('m')) return new Date(now.getTime() - val * 60000);
            if (window.endsWith('h')) return new Date(now.getTime() - val * 3600000);
            if (window.endsWith('d')) return new Date(now.getTime() - val * 86400000);
            return new Date(now.getTime() - 3600000);
        };
        const threshold = getThreshold(windowParam);

        // --- Window-Wide Streaming Aggregator (v3.1.0) ---
        // Decoupled from the 1000-line circular buffer.
        // Scans ALL relevant daily archives to build both Global and Result-Specific metrics.
        const globalCounters: Record<string, Record<string, number>> = {
            user_name: {},
            device_name: {},
            calling_station_id: {}
        };
        let globalTotal = 0;
        let globalFailures = 0;

        const results: any[] = [];
        const maxFeedLimit = query && query !== 'recent' ? 1000 : 200;

        // Helper: Process an entry into global metrics and optionally results
        const processEntry = (entry: any) => {
            const entryTime = new Date(entry.timestamp);
            if (entryTime < threshold) return;

            const msg = entry.raw || "";
            // Normalization Logic (v3.1.0)
            const extract = (key: string, greedy: boolean = false) => {
                const quotedMatch = msg.match(new RegExp(`${key}="(.*?)"`));
                if (quotedMatch) return quotedMatch[1].trim();
                if (greedy) {
                    const greedyMatch = msg.match(new RegExp(`${key}=(.*?)(,|]|$|$)`));
                    if (greedyMatch) return greedyMatch[1].trim();
                }
                const simpleMatch = msg.match(new RegExp(`${key}=(.*?)(,|\\s|$)`));
                return simpleMatch ? simpleMatch[1].trim() : "";
            };

            const extractAny = (keys: string[], greedy: boolean = false) => {
                for (const key of keys) {
                    const val = extract(key, greedy);
                    if (val && val !== "N/A" && val !== "None") {
                        return val.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
                    }
                }
                return "";
            };

            const isExplicitFail = msg.includes('Failed') || msg.includes('Denied') || msg.includes('Rejected');
            const user = extractAny(['User-Name', 'User', 'Admin-User']) || "Unknown";
            const device = extractAny(['Device-Name', 'NetworkDeviceName', 'Network_Device_Name', 'NAS-Identifier', 'nas-name']) || "Network Device";
            const source = extractAny(['Remote-Address', 'Address', 'Calling-Station-ID', 'Port']) || entry.source || "Unknown";
            
            const rawCmdSet = extractAny(['CmdAV', 'CmdSet', 'CommandSet', 'Command-String', 'Command'], true);
            const cleanCommand = (rawCmdSet || "N/A").replace(/^CmdAV=\s*/, '').replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();

            const normalized = {
                timestamp: entry.timestamp,
                user_name: user,
                nas_ip_address: extractAny(['Device-IP-Address', 'NAS-IP-Address', 'Device_IP_Address']) || entry.source || "Unknown",
                device_name: device,
                calling_station_id: source,
                status: isExplicitFail ? 'Failed' : 'Passed',
                command_set: cleanCommand,
                identity_group: extractAny(['Identity-Group', 'User-Identity-Group']) || "Default",
                raw_message: msg
            };

            // 1. Update Global Window Metrics (Untethered from search results)
            globalTotal++;
            if (isExplicitFail) globalFailures++;
            if (user !== "Unknown") globalCounters.user_name[user] = (globalCounters.user_name[user] || 0) + 1;
            if (device !== "Network Device") globalCounters.device_name[device] = (globalCounters.device_name[device] || 0) + 1;
            if (source !== "Unknown") globalCounters.calling_station_id[source] = (globalCounters.calling_station_id[source] || 0) + 1;

            // 2. Update Search Results Feed
            if (!query || query === 'recent') {
                if (results.length < maxFeedLimit) results.push(normalized);
            } else {
                const searchString = `${normalized.user_name} ${normalized.device_name} ${normalized.command_set} ${normalized.raw_message}`.toLowerCase();
                if (searchString.includes(query)) {
                    if (results.length < maxFeedLimit) results.push(normalized);
                }
            }
        };

        // --- Data Sources Scanning ---
        // Scans chronological order (latest first) to build the feed and metrics
        const historyFiles = fs.readdirSync(LOG_DIR)
            .filter(f => f.startsWith('tacacs-') && f.endsWith('.json') && f !== 'tacacs-recent.json')
            .sort().reverse(); // Sort descending (today first)

        // 1. Start with the "Recent Buffer" (JSON)
        if (fs.existsSync(BUFFER_PATH)) {
            try {
                const data = fs.readFileSync(BUFFER_PATH, 'utf8');
                const recent = JSON.parse(data);
                recent.reverse().forEach(processEntry);
            } catch (e) {}
        }

        // 2. Scan Daily Archives (JSONL) until timeframe exceeded
        for (const file of historyFiles) {
            const dateMatch = file.match(/tacacs-(\d{4}-\d{2}-\d{2})\.json/);
            if (!dateMatch) continue;
            const fileDate = new Date(dateMatch[1]);
            // If the start of this day is older than the threshold, we might still need some of it.
            // But if the whole day is older than the (threshold - 1 day), we can stop soon.
            if (fileDate < new Date(threshold.getTime() - 86400000)) break;

            const archivePath = path.join(LOG_DIR, file);
            try {
                const content = fs.readFileSync(archivePath, 'utf8');
                const lines = content.split('\n').filter(l => l.trim());
                // For the feed, we want latest first, so reverse lines
                lines.reverse().forEach(line => {
                    try {
                        const entry = JSON.parse(line);
                        processEntry(entry);
                    } catch (lErr) {}
                });
            } catch (err) {}
        }

        const getTopTenFromCounters = (counts: Record<string, number>) => {
            return Object.entries(counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([name, value]) => ({ name, value }));
        };

        return NextResponse.json({ 
            found: true, 
            sessions: results,
            metrics: {
                top_usernames: getTopTenFromCounters(globalCounters.user_name),
                top_devices: getTopTenFromCounters(globalCounters.device_name),
                top_sources: getTopTenFromCounters(globalCounters.calling_station_id),
                total_events: globalTotal,
                failures: globalFailures
            },
            count: results.length
        });

    } catch (error: any) {
        console.error("TACACS API Error:", error);
        return NextResponse.json({ error: error.message, sessions: [] }, { status: 500 });
    }
}
