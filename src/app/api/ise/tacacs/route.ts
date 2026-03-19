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

        // --- Time Window Calculation ---
        const now = new Date();
        const getThreshold = (window: string) => {
            const val = parseInt(window);
            if (window.endsWith('m')) return new Date(now.getTime() - val * 60000);
            if (window.endsWith('h')) return new Date(now.getTime() - val * 3600000);
            if (window.endsWith('d')) return new Date(now.getTime() - val * 86400000);
            return new Date(now.getTime() - 3600000);
        };
        const threshold = getThreshold(windowParam);

        // --- Forensic De-Duplication Engine (v3.2.0) ---
        // Uses a Signature Cache (Timestamp + Raw) to ensure 100% metric stability
        const processedSignatures = new Set<string>();
        
        const globalCounters: Record<string, Record<string, number>> = {
            user_name: {},
            device_name: {},
            calling_station_id: {}
        };
        let globalTotal = 0;
        let globalFailures = 0;

        const results: any[] = [];
        const maxFeedLimit = query && query !== 'recent' ? 1000 : 200;

        const processEntry = (entry: any) => {
            const entryTime = new Date(entry.timestamp);
            if (entryTime < threshold) return;

            // Signature Logic (v3.2.0): Eliminate duplicates between recent and daily files
            const signature = `${entry.timestamp}_${entry.raw}`.slice(0, 512);
            if (processedSignatures.has(signature)) return;
            processedSignatures.add(signature);

            const msg = entry.raw || "";
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
                    if (val && val !== "N/A") return val.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
                }
                return "";
            };

            const isExplicitFail = msg.includes('Failed') || msg.includes('Denied') || msg.includes('Rejected');
            const user = extractAny(['User-Name', 'User', 'Admin-User']) || "Unknown";
            const device = extractAny(['Device-Name', 'NetworkDeviceName', 'Network_Device_Name']) || "Network Device";
            const source = extractAny(['Remote-Address', 'Address', 'Calling-Station-ID']) || entry.source || "Unknown";
            
            const rawCmdSet = extractAny(['CmdAV', 'CmdSet', 'CommandSet', 'Command-String', 'Command'], true);
            const cleanCommand = (rawCmdSet || "N/A").replace(/^CmdAV=\s*/, '').replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();

            const normalized = {
                timestamp: entry.timestamp,
                user_name: user,
                nas_ip_address: entry.source || "Unknown",
                device_name: device,
                calling_station_id: source,
                status: isExplicitFail ? 'Failed' : 'Passed',
                command_set: cleanCommand,
                raw_message: msg
            };

            // 1. Update Global Window Metrics (v3.2.0: Guaranteed unlinked from search)
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

        // --- Chronic Scanning Logic ---
        // 1. Scan Recent Circular Buffer (JSON) - Always most fresh
        if (fs.existsSync(BUFFER_PATH)) {
            try {
                const data = fs.readFileSync(BUFFER_PATH, 'utf8');
                const recent = JSON.parse(data);
                recent.reverse().forEach(processEntry);
            } catch (e) {}
        }

        // 2. Scan All Historical Archives (JSONL) - Reverse Chronological
        const historyFiles = fs.readdirSync(LOG_DIR)
            .filter(f => f.startsWith('tacacs-') && f.endsWith('.json') && f !== 'tacacs-recent.json')
            .sort().reverse();

        for (const file of historyFiles) {
            const dateMatch = file.match(/tacacs-(\d{4}-\d{2}-\d{2})\.json/);
            if (!dateMatch) continue;
            const fileDate = new Date(dateMatch[1]);
            // If the day started > 24h before threshold, we can safely stop scanning
            if (fileDate < new Date(threshold.getTime() - 172800000)) break;

            const archivePath = path.join(LOG_DIR, file);
            try {
                const content = fs.readFileSync(archivePath, 'utf8');
                const lines = content.split('\n').filter(l => l.trim()).reverse(); 
                lines.forEach(line => {
                    try { processEntry(JSON.parse(line)); } catch(lErr) {}
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
