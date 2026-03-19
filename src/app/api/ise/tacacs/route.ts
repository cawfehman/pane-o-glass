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

        // --- Time Window Calculation (v3.0.0) ---
        const now = new Date();
        const getThreshold = (window: string) => {
            const val = parseInt(window);
            if (window.endsWith('m')) return new Date(now.getTime() - val * 60000);
            if (window.endsWith('h')) return new Date(now.getTime() - val * 3600000);
            if (window.endsWith('d')) return new Date(now.getTime() - val * 86400000);
            return new Date(now.getTime() - 3600000);
        };
        const threshold = getThreshold(windowParam);

        // --- History Loader (v3.0.0) ---
        // Scans tacacs-recent.json AND daily tacacs-YYYY-MM-DD.json (JSONL format)
        let rawEntries: any[] = [];
        
        // 1. Load Recent Buffer (JSON)
        if (fs.existsSync(BUFFER_PATH)) {
            try {
                const data = fs.readFileSync(BUFFER_PATH, 'utf8');
                rawEntries = JSON.parse(data);
            } catch (e) {
                console.error("Buffer parse error, skipping recent buffer.");
            }
        }

        // 2. Load Daily Archives (JSONL) if window > buffer or for metrics accuracy
        const daysToScan = windowParam.endsWith('d') ? parseInt(windowParam) : 1;
        for (let i = 0; i <= daysToScan; i++) {
            const d = new Date(now.getTime() - i * 86400000);
            const dateStr = d.toISOString().split('T')[0];
            const archivePath = path.join(LOG_DIR, `tacacs-${dateStr}.json`);
            
            if (fs.existsSync(archivePath)) {
                try {
                    const content = fs.readFileSync(archivePath, 'utf8');
                    const lines = content.split('\n').filter(l => l.trim());
                    lines.forEach(line => {
                        try {
                            const entry = JSON.parse(line);
                            // Avoid duplicates from recent buffer by checking raw msg + timestamp
                            rawEntries.push(entry);
                        } catch (lineErr) {}
                    });
                } catch (err) {}
            }
        }

        // Deduplicate and filter by threshold
        // Use a Set or Map to track unique raw messages if needed, but for analytics, 
        // we just filter by time and count.
        const windowedRaw = rawEntries.filter(e => new Date(e.timestamp) >= threshold);

        // --- Normalize & Extractor Engine (v3.0.0) ---
        const normalize = (entry: any) => {
            const msg = entry.raw || "";
            const extract = (key: string, greedy: boolean = false) => {
                const quotedMatch = msg.match(new RegExp(`${key}="(.*?)"`));
                if (quotedMatch) return quotedMatch[1].trim();
                // Greedy lookup for space-containing values terminated by , or ]
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
            const rawCmdSet = extractAny(['CmdAV', 'CmdSet', 'CommandSet', 'Command-String', 'Command'], true);
            const cleanCommand = (rawCmdSet || "N/A")
                .replace(/^CmdAV=\s*/, '')
                .replace(/^\[\s*/, '') 
                .replace(/\s*\]$/, '').trim();

            return {
                timestamp: entry.timestamp,
                user_name: extractAny(['User-Name', 'User', 'Admin-User']) || "Unknown",
                nas_ip_address: extractAny(['Device-IP-Address', 'NAS-IP-Address', 'Device_IP_Address']) || entry.source || "Unknown",
                device_name: extractAny(['Device-Name', 'NetworkDeviceName', 'Network_Device_Name', 'NAS-Identifier', 'nas-name']) || "Network Device",
                calling_station_id: extractAny(['Remote-Address', 'Address', 'Calling-Station-ID', 'Port']) || entry.source || "Unknown",
                status: isExplicitFail ? 'Failed' : 'Passed',
                command_set: cleanCommand,
                identity_group: extractAny(['Identity-Group', 'User-Identity-Group']) || "Default",
                raw_message: msg
            };
        };

        const normalizedList = windowedRaw.map(normalize);

        // --- Aggregation Engine (Top 10s) ---
        const getTopTen = (arr: any[], key: string) => {
            const counts: Record<string, number> = {};
            arr.forEach(item => {
                const val = item[key];
                if (val && val !== "Unknown" && val !== "Network Device") {
                    counts[val] = (counts[val] || 0) + 1;
                }
            });
            return Object.entries(counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([name, value]) => ({ name, value }));
        };

        const metrics = {
            top_usernames: getTopTen(normalizedList, 'user_name'),
            top_devices: getTopTen(normalizedList, 'device_name'),
            top_sources: getTopTen(normalizedList, 'calling_station_id'),
            total_events: normalizedList.length,
            failures: normalizedList.filter(e => e.status === 'Failed').length
        };

        // --- Search Filter (Search ALL history if query provided, up to 2000 results) ---
        let filteredResults = normalizedList;
        if (query && query !== 'recent') {
            filteredResults = normalizedList.filter((s: any) => 
                s.user_name.toLowerCase().includes(query) ||
                s.device_name.toLowerCase().includes(query) ||
                s.command_set.toLowerCase().includes(query) ||
                s.raw_message.toLowerCase().includes(query)
            );
        }

        // Return latest events first, limit feed to avoid browser crashes (200 records default)
        filteredResults.reverse();
        const feedLimit = query ? 500 : 200;

        return NextResponse.json({ 
            found: true, 
            sessions: filteredResults.slice(0, feedLimit),
            metrics,
            count: filteredResults.length
        });

    } catch (error: any) {
        console.error("TACACS API Error:", error);
        return NextResponse.json({ error: error.message, sessions: [] }, { status: 500 });
    }
}
