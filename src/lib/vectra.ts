import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

const VECTRA_CLIENT_ID = process.env.VECTRA_CLIENT_ID || '';
const VECTRA_CLIENT_SECRET = process.env.VECTRA_CLIENT_SECRET || '';
const RAW_URL = (process.env.VECTRA_URL || '').replace(/\/$/, '');
const VECTRA_URL = RAW_URL.replace(/\/api\/v[0-9.]+$/, '');

async function getVectraToken() {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    if (!VECTRA_URL || !VECTRA_CLIENT_ID || !VECTRA_CLIENT_SECRET) {
        throw new Error("Vectra credentials missing in environment variables.");
    }

    try {
        const response = await axios.post(`${VECTRA_URL}/oauth2/token`, 
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'read',
                client_id: VECTRA_CLIENT_ID,
                client_secret: VECTRA_CLIENT_SECRET
            }), 
            {
                httpsAgent,
                auth: {
                    username: VECTRA_CLIENT_ID,
                    password: VECTRA_CLIENT_SECRET
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        cachedToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
        return cachedToken;
    } catch (error: any) {
        console.error("Failed to acquire Vectra OAuth2 token:", error.response?.data || error.message);
        throw new Error("Vectra Authentication Failed");
    }
}

export async function getVectraHosts(params: any = {}) {
    const token = await getVectraToken();
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/hosts`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: {
                ordering: '-last_detection_timestamp',
                min_threat: 0,
                min_certainty: 0,
                ...params
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra hosts:", error.response?.data || error.message);
        return { results: [] };
    }
}

export async function getVectraDetections(params: any = {}) {
    const token = await getVectraToken();
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/detections`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: {
                ordering: '-last_timestamp',
                min_threat: 0,
                min_certainty: 0,
                ...params
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra detections:", error.response?.data || error.message);
        return { results: [] };
    }
}

export async function getVectraAccounts(params: any = {}) {
    const token = await getVectraToken();
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/accounts`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: {
                ordering: '-last_detection_timestamp',
                min_threat: 0,
                min_certainty: 0,
                ...params
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra accounts:", error.response?.data || error.message);
        return { results: [] };
    }
}

/**
 * Vectra Recall Metadata Search
 * Piecing together network traffic for a host or IP.
 */
export async function searchVectraMetadata(query: string, limit: number = 100) {
    const token = await getVectraToken();
    try {
        // Recall API often uses /api/v1/search/metadata OR integrated search in v3.4
        // Looking at common RUX/SaaS deployments, it's often a POST to a search endpoint
        const response = await axios.post(`${VECTRA_URL}/api/v3.4/events`, {
            query: query,
            limit: limit
        }, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error searching Vectra metadata (Recall):", error.response?.data || error.message);
        return { results: [] };
    }
}
