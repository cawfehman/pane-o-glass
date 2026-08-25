import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function debugFixEnvelopeLookup() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING ENVELOPE SEARCH FOR MID 299250257 ===");

    const mid = "299250257";
    const params = new URLSearchParams({
        query: `(esa_mid:"${mid}" OR message:"MID ${mid}") AND (message:"From:" OR message:"To:" OR message:"Subject" OR _exists_:esa_mail_from OR _exists_:esa_rcpt_to OR _exists_:esa_subject)`,
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "20",
        sort: "timestamp:desc"
    });

    const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
        httpsAgent,
        headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
        timeout: 10000
    });

    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} targeted envelope log lines for MID ${mid}:`);

    messages.forEach((m: any) => {
        const raw = m.message.message || "";
        console.log(`- RAW: ${raw}`);
        if (m.message.esa_mail_from || m.message.esa_rcpt_to || m.message.esa_subject) {
            console.log(`  [INDEXED]: From=${m.message.esa_mail_from}, To=${m.message.esa_rcpt_to}, Subj=${m.message.esa_subject}`);
        }
    });
}

debugFixEnvelopeLookup();
