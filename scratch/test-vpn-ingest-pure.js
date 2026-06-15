const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SAMPLE_LOGS = [
    // 1. Success Connection Event
    "%FTD-6-113039: Group <GP_Corporate> User <alex.jones> IP <8.8.8.8> session established.",
    // 2. Disconnect Session Event
    "%FTD-4-113019: Group <GP_Corporate> User <alex.jones> IP <8.8.8.8> Separate Session Policy: Duration: 0h:15m:45s, Rx Rules: 0, Tx Rules: 0, Bytes Tx: 4500123, Bytes Rx: 8900456",
    // 3. Failure Connection Event
    "%FTD-6-113015: AAA user authentication Rejected : reason = Password expired : User = sarah.connor : IP = 1.1.1.1",
    // 4. Success Connection Event for private IP (should bypass enrichment)
    "%FTD-6-113039: Group <GP_Devs> User <bob.smith> IP <10.10.50.22> session established."
];

function ipToLong(ip) {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

const NON_PUBLIC_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" },
    { start: "100.64.0.0", end: "100.127.255.255" },
    { start: "127.0.0.0", end: "127.255.255.255" },
    { start: "169.254.0.0", end: "169.254.255.255" },
    { start: "172.16.0.0", end: "172.31.255.255" },
    { start: "192.0.0.0", end: "192.0.0.255" },
    { start: "192.0.2.0", end: "192.0.2.255" },
    { start: "192.168.0.0", end: "192.168.255.255" }
];

function isPrivateIp(ip) {
    const ipLong = ipToLong(ip);
    return NON_PUBLIC_RANGES.some(range => {
        return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
    });
}

// Mock getIpInfoLite behavior to avoid external calls or API tokens issues in test environment
function getMockIpInfo(ip) {
    if (isPrivateIp(ip)) return null;
    return {
        asn: "AS15169",
        as_name: "Google LLC",
        as_domain: "google.com",
        country: "United States",
        country_code: "US"
    };
}

// Helper to parse duration string (e.g. 0h:05m:30s) to seconds
function parseDuration(durationStr) {
    if (!durationStr) return null;
    const match = durationStr.trim().match(/(\d+)\s*h\s*:\s*(\d+)\s*m\s*:\s*(\d+)\s*s/i);
    if (match) {
        return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
    }
    const seconds = parseInt(durationStr, 10);
    return isNaN(seconds) ? null : seconds;
}

async function testIngestion() {
    console.log("Starting pure VPN Ingestion test...");

    for (const rawLog of SAMPLE_LOGS) {
        console.log(`\nParsing log: "${rawLog}"`);
        let username = "";
        let sourceIp = "";
        let status = "SUCCESS";
        let duration = null;
        let bytesSent = null;
        let bytesReceived = null;
        let failureReason = null;

        const connRegex = /%(?:FTD|ASA)-\d-113039:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>/i;
        const failRegex = /%(?:FTD|ASA)-\d-113015:\s+AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
        const discRegex = /%(?:FTD|ASA)-\d-113019:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>.*?Duration:\s*([^,]+).*?Bytes\s+Tx:\s*(\d+).*?Bytes\s+Rx:\s*(\d+)/i;

        if (connRegex.test(rawLog)) {
            const match = rawLog.match(connRegex);
            if (match) {
                username = match[1];
                sourceIp = match[2];
                status = "SUCCESS";
            }
        } else if (failRegex.test(rawLog)) {
            const match = rawLog.match(failRegex);
            if (match) {
                failureReason = match[1].trim();
                username = match[2].trim();
                sourceIp = match[3].trim();
                status = "FAILURE";
            }
        } else if (discRegex.test(rawLog)) {
            const match = rawLog.match(discRegex);
            if (match) {
                username = match[1];
                sourceIp = match[2];
                status = "DISCONNECT";
                duration = parseDuration(match[3]);
                bytesSent = parseFloat(match[4]);
                bytesReceived = parseFloat(match[5]);
            }
        }

        console.log(`Parsed: User=${username}, IP=${sourceIp}, Status=${status}, Duration=${duration}, Tx=${bytesSent}, Rx=${bytesReceived}, Failure=${failureReason}`);

        const ipInfo = getMockIpInfo(sourceIp);
        if (ipInfo) {
            console.log(`Enrichment (Mocked) for ${sourceIp}: Country=${ipInfo.country}, Org=${ipInfo.as_name}`);
        } else {
            console.log(`Enrichment skipped for local/private IP: ${sourceIp}`);
        }

        const bytesTotal = (bytesSent !== null || bytesReceived !== null) 
            ? (bytesSent || 0) + (bytesReceived || 0) 
            : null;

        // Insert to DB
        const event = await prisma.vpnEvent.create({
            data: {
                username,
                sourceIp,
                status,
                duration,
                bytesSent,
                bytesReceived,
                bytesTotal,
                failureReason,
                ipAsn: ipInfo?.asn || null,
                ipAsName: ipInfo?.as_name || null,
                ipAsDomain: ipInfo?.as_domain || null,
                ipCountry: ipInfo?.country || null,
                ipCountryCode: ipInfo?.country_code || null,
            }
        });

        console.log(`Successfully saved to database. Event ID: ${event.id}`);
    }
}

testIngestion()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
