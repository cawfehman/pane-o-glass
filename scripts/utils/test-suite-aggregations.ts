import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testSuiteAggregations() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING ALL 3 NEW SUITE AGGREGATION QUERIES ===");

    // Query 1: AMP Attachment IOCs
    const ampParams = new URLSearchParams({
        query: '_exists_:esa_amp_file_verdict OR message:"AMP file reputation verdict"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "50",
        sort: "timestamp:desc"
    });

    // Query 2: SPF / DKIM / DMARC Authentication Failures
    const authParams = new URLSearchParams({
        query: 'message:"SPF:" OR message:"DKIM:" OR message:"DMARC:" OR _exists_:esa_spf_verdict',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "50",
        sort: "timestamp:desc"
    });

    // Query 3: Target Recipient Threat Aggregation
    const recipientParams = new URLSearchParams({
        query: 'esa_url_rep_score:[-10.0 TO -0.1] OR esa_url_rep_score:/-[0-9]\\..*/ OR message:"reputation -"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "50",
        sort: "timestamp:desc"
    });

    try {
        const [ampRes, authRes, rcptRes] = await Promise.all([
            axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${ampParams.toString()}`, { httpsAgent, headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" }, timeout: 10000 }),
            axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${authParams.toString()}`, { httpsAgent, headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" }, timeout: 10000 }),
            axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${recipientParams.toString()}`, { httpsAgent, headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" }, timeout: 10000 })
        ]);

        console.log(`AMP Hits: ${ampRes.data.messages?.length || 0}`);
        console.log(`Auth Hits: ${authRes.data.messages?.length || 0}`);
        console.log(`Recipient Threat Hits: ${rcptRes.data.messages?.length || 0}`);

    } catch (e: any) {
        console.error("Error testing queries:", e.message);
    }
}

testSuiteAggregations();
