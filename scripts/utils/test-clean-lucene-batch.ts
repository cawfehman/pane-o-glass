import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testCleanLuceneBatch() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING CLEAN LUCENE BATCH QUERY FOR MIDs ===");

    const mids = ["286982796", "286982775", "286982740", "286982762", "286982768", "286982765", "286982777", "299253803"];
    
    // Clean Lucene syntax
    const midTerms = mids.map(m => `"${m}"`).join(" OR ");
    const batchQuery = `(esa_mid:(${midTerms}) OR message:(${midTerms})) AND NOT message:"URL"`;

    console.log("Clean Lucene Query:", batchQuery);

    const envParams = new URLSearchParams({
        query: batchQuery,
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "150",
        sort: "timestamp:desc"
    });

    const envRes = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${envParams.toString()}`, {
        httpsAgent,
        headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
        timeout: 10000
    });

    const envLogs = envRes.data.messages || [];
    console.log(`Retrieved ${envLogs.length} envelope logs for batch query.`);

    const midHeaderMap: Record<string, { sender?: string, recipient?: string, subject?: string }> = {};
    mids.forEach(m => { midHeaderMap[m] = {}; });

    envLogs.forEach((h: any) => {
        const raw = h.message.message || "";
        const match = raw.match(/MID (\d+)/);
        const mid = h.message.esa_mid || (match ? match[1] : "");
        if (!mid || !midHeaderMap[mid]) return;

        const fromMatch = raw.match(/From:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/bytes from <([^>]+)>/i) || raw.match(/From:\s*(\S+)/i);
        const toMatch = raw.match(/To:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);
        const subjMatch = raw.match(/Subject\s*['"]([^'"]+)['"]/i) || raw.match(/Subject\s*:?\s*(.+)/i);

        if (!midHeaderMap[mid].sender && (h.message.esa_mail_from || fromMatch)) {
            midHeaderMap[mid].sender = h.message.esa_mail_from || (fromMatch ? fromMatch[1] : undefined);
        }
        if (!midHeaderMap[mid].recipient && (h.message.esa_rcpt_to || toMatch)) {
            midHeaderMap[mid].recipient = h.message.esa_rcpt_to || (toMatch ? toMatch[1] : undefined);
        }
        if (!midHeaderMap[mid].subject && (h.message.esa_subject || subjMatch)) {
            midHeaderMap[mid].subject = h.message.esa_subject || (subjMatch ? subjMatch[1].trim() : undefined);
        }
    });

    console.log("\n--- ENRICHED ENVELOPE RESULTS ---");
    mids.forEach(m => {
        console.log(`MID ${m}:`);
        console.log(`  Sender:    ${midHeaderMap[m].sender || "❌ UNKNOWN"}`);
        console.log(`  Recipient: ${midHeaderMap[m].recipient || "❌ UNKNOWN"}`);
        console.log(`  Subject:   ${midHeaderMap[m].subject || "❌ UNKNOWN"}`);
    });
}

testCleanLuceneBatch();
