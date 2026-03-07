import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import os from "os";

const execAsync = promisify(exec);

export async function GET() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as any)?.role === 'ADMIN';

        if (!isAdmin) {
            return new NextResponse("Unauthorized", { status: 401 });
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
            topProbes: []
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
