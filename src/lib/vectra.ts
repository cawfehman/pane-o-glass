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
    const queryParams: any = {
        ordering: params.ordering || '-t_score',
    };
    
    if (params.name) queryParams.name = params.name;

    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/hosts`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: queryParams
        });
        
        // Manual filter for higher fidelity if requested
        if (params.highRiskOnly) {
            return {
                ...response.data,
                results: response.data.results.filter((h: any) => 
                    (h.threat > 0 || h.t_score > 0 || h.certainty > 0 || h.c_score > 0)
                )
            };
        }

        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra hosts:", error.response?.data || error.message);
        return { results: [] };
    }
}

export async function getVectraDetections(params: any = {}) {
    const token = await getVectraToken();
    const queryParams: any = {
        ordering: '-last_timestamp',
    };

    if (params.name) queryParams.name = params.name;
    if (params.host_id) queryParams.host_id = params.host_id;

    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/detections`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: queryParams
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra detections:", error.response?.data || error.message);
        return { results: [] };
    }
}

export async function getVectraAccounts(params: any = {}) {
    const token = await getVectraToken();
    const queryParams: any = {
        ordering: params.ordering || '-t_score',
    };

    if (params.name) queryParams.name = params.name;

    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/accounts`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: queryParams
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra accounts:", error.response?.data || error.message);
        return { results: [] };
    }
}

export async function getVectraAccountDetails(id: string) {
    const token = await getVectraToken();
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/accounts/${id}`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra account details:", error.response?.data || error.message);
        return null;
    }
}

export async function getVectraHostDetails(id: string) {
    const token = await getVectraToken();
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.4/hosts/${id}`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error fetching Vectra host details:", error.response?.data || error.message);
        return null;
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
