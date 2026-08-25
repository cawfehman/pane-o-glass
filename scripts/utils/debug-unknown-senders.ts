import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function debugUnknownSenders() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== INSPECTING RAW GRAYLOG LOGS FOR SENDER & RECIPIENT FIELDS ===");

    // Fetch 20 recent logs with URL reputation scores
    const params = new URLSearchParams({
        query: 'esa_url_rep_score:[-10.0 TO -0.1] OR esa_url_rep_score:/-[0-9]\\..*/ OR (message:"reputation -" AND message:"URL")',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "10",
        sort: "timestamp:desc"
    });

    const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
        httpsAgent,
        headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
        timeout: 10000
    });

    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} URL Reputation score log lines.`);

    for (const m of messages) {
        const msg = m.message;
        const raw = msg.message || "";
        const midMatch = raw.match(/MID (\d+)/);
        const mid = msg.esa_mid || (midMatch ? midMatch[1] : "");

        console.log(`\n--------------------------------------------------`);
        console.log(`Log Message ID (MID): ${mid}`);
        console.log(`Raw Message: ${raw}`);
        console.log(`Extracted Graylog Fields:`);
        console.log(`  - esa_mail_from: ${msg.esa_mail_from || "NOT PRESENT"}`);
        console.log(`  - esa_rcpt_to:   ${msg.esa_rcpt_to || "NOT PRESENT"}`);
        console.log(`  - esa_subject:   ${msg.esa_subject || "NOT PRESENT"}`);

        // Perform batch search for sibling MID lines
        if (mid) {
            const siblingParams = new URLSearchParams({
                query: `esa_mid:"${mid}" OR message:"MID ${mid}"`,
                range: "86400",
                filter: `streams:${streamId}`,
                limit: "100",
                sort: "timestamp:desc"
            });
            const sibRes = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${siblingParams.toString()}`, {
                httpsAgent,
                headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                timeout: 10000
            });
            const siblings = sibRes.data.messages || [];
            console.log(`Found ${siblings.length} sibling log lines for MID ${mid}:`);
            
            let foundFrom = false;
            let foundTo = false;
            let foundSubj = false;

            siblings.forEach((s: any) => {
                const sRaw = s.message.message || "";
                if (sRaw.includes("From:")) {
                    console.log(`  [FROM LINE]: ${sRaw}`);
                    foundFrom = true;
                }
                if (sRaw.includes("To:")) {
                    console.log(`  [TO LINE]: ${sRaw}`);
                    foundTo = true;
                }
                if (sRaw.includes("Subject")) {
                    console.log(`  [SUBJ LINE]: ${sRaw}`);
                    foundSubj = true;
                }
                if (s.message.esa_mail_from || s.message.esa_rcpt_to || s.message.esa_subject) {
                    console.log(`  [INDEXED FIELD MATCH]: esa_mail_from=${s.message.esa_mail_from}, esa_rcpt_to=${s.message.esa_rcpt_to}, esa_subject=${s.message.esa_subject}`);
                }
            });

            if (!foundFrom) console.log(`  ⚠️ NO "From:" line found in sibling logs for MID ${mid}`);
            if (!foundTo) console.log(`  ⚠️ NO "To:" line found in sibling logs for MID ${mid}`);
            if (!foundSubj) console.log(`  ⚠️ NO "Subject" line found in sibling logs for MID ${mid}`);
        }
    }
}

debugUnknownSenders();
