import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function debugMidLookup() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== STEP 1: FETCH LOGS CONTAINING URL REPUTATION SCORES ===");

    const params = new URLSearchParams({
        query: '_exists_:esa_url_rep_score OR (message:"URL" AND message:"reputation")',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "20",
        sort: "timestamp:desc"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        console.log(`Fetched ${messages.length} URL score log hits.`);

        const mids: string[] = [];
        messages.forEach((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            if (mid && !mids.includes(mid)) mids.push(mid);
        });

        console.log(`Found ${mids.length} unique MIDs:`, mids.slice(0, 5));

        if (mids.length === 0) return;

        console.log("\n=== STEP 2: BATCH LOOKUP ALL LOGS FOR THESE SPECIFIC MIDs ===");
        const batchQuery = mids.slice(0, 10).map(m => `esa_mid:"${m}" OR message:"MID ${m}"`).join(" OR ");

        const batchParams = new URLSearchParams({
            query: batchQuery,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "150",
            sort: "timestamp:desc"
        });

        const batchRes = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${batchParams.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const midLogs = batchRes.data.messages || [];
        console.log(`Fetched ${midLogs.length} total logs for target MIDs.`);

        const envelopeMap: Record<string, { from?: string; to?: string; subject?: string }> = {};

        midLogs.forEach((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            if (!mid) return;

            if (!envelopeMap[mid]) envelopeMap[mid] = {};

            const fromMatch = raw.match(/From:\s*<([^>]+)>/i) || raw.match(/From:\s*(\S+)/i);
            const toMatch = raw.match(/To:\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);
            const subjMatch = raw.match(/Subject\s*['"]([^'"]+)['"]/i) || raw.match(/Subject\s*:?\s*(.+)/i);

            if ((h.message.esa_mail_from || fromMatch) && !envelopeMap[mid].from) {
                envelopeMap[mid].from = h.message.esa_mail_from || (fromMatch ? fromMatch[1] : undefined);
            }
            if ((h.message.esa_rcpt_to || toMatch) && !envelopeMap[mid].to) {
                envelopeMap[mid].to = h.message.esa_rcpt_to || (toMatch ? toMatch[1] : undefined);
            }
            if ((h.message.esa_subject || subjMatch) && !envelopeMap[mid].subject) {
                envelopeMap[mid].subject = h.message.esa_subject || (subjMatch ? subjMatch[1].trim() : undefined);
            }
        });

        console.log("\n=== STEP 3: ENVELOPE RESULTS AFTER BATCH LOOKUP ===");
        mids.slice(0, 5).forEach(mid => {
            console.log(`MID ${mid}:`);
            console.log(`  Subject: ${envelopeMap[mid]?.subject || 'unknown'}`);
            console.log(`  From: ${envelopeMap[mid]?.from || 'unknown'}`);
            console.log(`  To: ${envelopeMap[mid]?.to || 'unknown'}`);
        });

    } catch (e: any) {
        console.error("Error in debugMidLookup:", e.message);
    }
}

debugMidLookup();
