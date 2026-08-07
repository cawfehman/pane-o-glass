import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function checkMidDuplication() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const params = new URLSearchParams({
        query: 'message:"inbound table"',
        range: "3600", // 1 hour
        filter: `streams:${streamId}`,
        limit: "50"
    });

    const url = `${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;

    try {
        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        const midCounts: Record<string, number> = {};
        const midDetails: Record<string, string[]> = {};

        messages.forEach((m: any) => {
            const raw = m.message.message;
            const match = raw.match(/MID (\d+)/);
            if (match) {
                const mid = match[1];
                midCounts[mid] = (midCounts[mid] || 0) + 1;
                if (!midDetails[mid]) midDetails[mid] = [];
                midDetails[mid].push(raw);
            }
        });

        console.log(`--- Checked 50 recent 'inbound table' log lines ---`);
        console.log(`Total Unique MIDs: ${Object.keys(midCounts).length}`);
        
        let duplicateCount = 0;
        for (const [mid, count] of Object.entries(midCounts)) {
            if (count > 1) {
                duplicateCount++;
                console.log(`MID ${mid} appears ${count} times in 'inbound table':`);
                midDetails[mid].forEach(line => console.log(`  -> ${line}`));
            }
        }

        if (duplicateCount === 0) {
            console.log("No duplicate MIDs found in sample of 50.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

checkMidDuplication();
