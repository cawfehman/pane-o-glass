import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testParseMessageEnvelope() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING ENVELOPE (SENDER, RECIPIENT, SUBJECT) EXTRACTION PER MID ===");

    // Fetch 100 recent messages from Graylog containing MID
    const params = new URLSearchParams({
        query: 'message:"MID"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "150",
        sort: "timestamp:desc"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        console.log(`Fetched ${messages.length} log events.\n`);

        const envelopeMap: Record<string, { from?: string; to?: string; subject?: string }> = {};

        messages.forEach((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            if (!midMatch) return;
            const mid = midMatch[1];

            if (!envelopeMap[mid]) envelopeMap[mid] = {};

            const fromMatch = raw.match(/From:\s*<([^>]+)>/i) || raw.match(/From:\s*(\S+)/i);
            const toMatch = raw.match(/To:\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);
            const subjMatch = raw.match(/Subject\s*['"]([^'"]+)['"]/i) || raw.match(/Subject\s*:?\s*(.+)/i);

            if (fromMatch && !envelopeMap[mid].from) envelopeMap[mid].from = fromMatch[1];
            if (toMatch && !envelopeMap[mid].to) envelopeMap[mid].to = toMatch[1];
            if (subjMatch && !envelopeMap[mid].subject) envelopeMap[mid].subject = subjMatch[1].trim();
        });

        console.log("Extracted Envelopes for Recent MIDs:");
        Object.entries(envelopeMap).slice(0, 10).forEach(([mid, env]) => {
            console.log(`MID ${mid}:`);
            console.log(`  From: ${env.from || "unknown"}`);
            console.log(`  To: ${env.to || "unknown"}`);
            console.log(`  Subject: ${env.subject || "unknown"}`);
        });

    } catch (e: any) {
        console.error("Error testing envelope extraction:", e.message);
    }
}

testParseMessageEnvelope();
