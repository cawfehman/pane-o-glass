import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import os from "os";
import axios from "axios";
import * as https from "https";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Check Graylog Node Health
        const graylogHealth: any = { status: "NOT_CONFIGURED", url: process.env.GRAYLOG_URL || "N/A" };
        if (process.env.GRAYLOG_URL && process.env.GRAYLOG_API_TOKEN) {
            const rawUrl = process.env.GRAYLOG_URL;
            const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
            const token = process.env.GRAYLOG_API_TOKEN.replace(/^"|"$/g, '');
            const authHeader = token.includes(":") 
                ? `Basic ${Buffer.from(token).toString("base64")}`
                : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
            const agent = new https.Agent({ rejectUnauthorized: false });

            const start = Date.now();
            try {
                const [sysRes, journalRes] = await Promise.all([
                    axios.get(`${url}/api/system`, {
                        headers: {
                            "Authorization": authHeader,
                            "Accept": "application/json",
                            "X-Requested-By": "cli"
                        },
                        httpsAgent: agent,
                        timeout: 5000
                    }),
                    axios.get(`${url}/api/system/journal`, {
                        headers: {
                            "Authorization": authHeader,
                            "Accept": "application/json",
                            "X-Requested-By": "cli"
                        },
                        httpsAgent: agent,
                        timeout: 5000
                    }).catch(err => {
                        console.error("Failed to query Graylog journal api:", err.message);
                        return null; // fallback gracefully if journal endpoint fails
                    })
                ]);

                if (sysRes.status === 200) {
                    graylogHealth.status = "ONLINE";
                    graylogHealth.latency = `${Date.now() - start}ms`;
                    graylogHealth.version = sysRes.data?.version || "Unknown";
                    graylogHealth.nodeId = sysRes.data?.node_id || "Unknown";
                    
                    if (journalRes && journalRes.status === 200) {
                        graylogHealth.journal = {
                            enabled: journalRes.data?.enabled ?? false,
                            uncommittedEntries: journalRes.data?.uncommitted_journal_entries ?? 0,
                            sizeBytes: journalRes.data?.journal_size ?? 0,
                            sizeLimitBytes: journalRes.data?.journal_size_limit ?? 0,
                            oldestSegment: journalRes.data?.oldest_segment || null,
                            appendPerSec: journalRes.data?.append_events_per_second ?? 0,
                            readPerSec: journalRes.data?.read_events_per_second ?? 0
                        };
                    }
                } else {
                    graylogHealth.status = "DEGRADED";
                    graylogHealth.error = `Response code: ${sysRes.status}`;
                }
            } catch (err: any) {
                graylogHealth.status = "OFFLINE";
                graylogHealth.error = err.message || "Network timeout";
            }
        }

        // Metrics Object
        const metrics: any = {
            osType: os.type(),
            osRelease: os.release(),
            uptime: os.uptime(),
            cpuUsage: 0,
            memTotal: os.totalmem(),
            memFree: os.freemem(),
            diskUsage: "0%",
            processesCpu: [],
            processesMem: [],
            totalProbes: 0,
            topProbes: [],
            graylogHealth
        };

        // If we are on Linux, we can run advanced parsing commands
        if (os.platform() === 'linux') {
            try {
                // Disk Usage (Root)
                const { stdout: dfOut } = await execAsync('df -h / | awk \'NR==2 {print $5}\'');
                metrics.diskUsage = dfOut.trim();

                // Top 10 CPU Processes
                const { stdout: psCpuOut } = await execAsync('ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%cpu | head -n 11');
                metrics.processesCpu = parsePsOutput(psCpuOut);

                // Top 10 Mem Processes
                const { stdout: psMemOut } = await execAsync('ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 11');
                metrics.processesMem = parsePsOutput(psMemOut);

                // CPU Usage (approximate from load averages or simple ping)
                const cpus = os.cpus();
                metrics.cpuUsage = Math.round((os.loadavg()[0] / cpus.length) * 100);
            } catch (cmdErr) {
                console.error("Failed to run Linux specific commands:", cmdErr);
            }
        }

        // Fetch Probe Stats from SQLite
        metrics.totalProbes = await prisma.healthProbe.count();

        const topSources = await prisma.healthProbe.groupBy({
            by: ['ipAddress'],
            _count: {
                ipAddress: true,
            },
            orderBy: {
                _count: {
                    ipAddress: 'desc',
                },
            },
            take: 10,
        });

        metrics.topProbes = topSources.map((s) => ({
            ip: s.ipAddress,
            count: s._count.ipAddress
        }));

        return NextResponse.json(metrics);

    } catch (error) {
        console.error("Health API Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

// Helper to parse `ps` command output
function parsePsOutput(output: string) {
    const lines = output.trim().split('\n');
    lines.shift(); // Remove header
    return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        // pid(0), ppid(1), cmd(2 to length-2), %mem(length-2), %cpu(length-1)
        if (parts.length < 5) return null;

        const cpu = parts.pop();
        const mem = parts.pop();
        const cmd = parts.slice(2).join(' ');

        // Strip out exceedingly long paths for display
        const displayCmd = cmd.length > 50 ? "..." + cmd.slice(-47) : cmd;

        return {
            pid: parts[0],
            cmd: displayCmd,
            mem: mem,
            cpu: cpu
        };
    }).filter(Boolean);
}
