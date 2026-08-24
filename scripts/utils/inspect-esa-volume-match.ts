import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectVolumeMatch() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const queries = [
        { name: "Total Inbound Volume", query: 'message:"inbound table"' },
        { name: "ESA01 Inbound", query: 'message:"inbound table" AND (source:esa01* OR message:esa01*)' },
        { name: "ESA02 Inbound", query: 'message:"inbound table" AND (source:esa02* OR message:esa02*)' },
        { name: "SMA Inbound", query: 'message:"inbound table" AND (source:sma* OR message:sma*)' },
        { name: "Unassigned Inbound", query: 'message:"inbound table" AND NOT (source:esa01* OR message:esa01*) AND NOT (source:esa02* OR message:esa02*)' }
    ];

    console.log("=== 24-HOUR INBOUND VOLUME MATCH TEST (86,400s) ===");

    let esa01Val = 0;
    let esa02Val = 0;
    let totalVal = 0;

    for (const q of queries) {
        const params = new URLSearchParams({
            query: q.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "1"
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
                timeout: 8000
            });

            const count = res.data.total_results || 0;
            console.log(`[Query] ${q.name} -> ${count.toLocaleString()}`);

            if (q.name.includes("Total Inbound")) totalVal = count;
            if (q.name.includes("ESA01 Inbound")) esa01Val = count;
            if (q.name.includes("ESA02 Inbound")) esa02Val = count;
        } catch (e: any) {
            console.error(`[Query] ${q.name} -> Error ${e.message}`);
        }
    }

    console.log(`\nCalculation Check:`);
    console.log(`  ESA01 (${esa01Val.toLocaleString()}) + ESA02 (${esa02Val.toLocaleString()}) = ${(esa01Val + esa02Val).toLocaleString()}`);
    console.log(`  Total Inbound: ${totalVal.toLocaleString()}`);
    console.log(`  Difference: ${totalVal - (esa01Val + esa02Val)}`);
}

inspectVolumeMatch();
