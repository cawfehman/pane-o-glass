/**
 * Cisco Umbrella Investigate API Client (v2 OAuth2)
 */

export interface UmbrellaCategorizationResponse {
    status: number; // -1 for malicious, 0 for uncategorized, 1 for benign
    categories: string[];
    securityCategories: string[];
    source: "live" | "simulated";
    error?: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Retrieve active OAuth2 Bearer token from Cisco Umbrella.
 * Re-uses cached token if valid.
 */
async function getUmbrellaAccessToken(): Promise<string | null> {
    const clientId = process.env.CISCO_UMBRELLA_API_TOKEN;
    const clientSecret = process.env.CISCO_UMBRELLA_API_SECRET;

    if (!clientId || !clientSecret) {
        return null;
    }

    const now = Date.now();
    // Re-use cached token if it has at least 30 seconds of life remaining
    if (cachedToken && tokenExpiresAt > now + 30000) {
        return cachedToken;
    }

    try {
        const authHeader = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch("https://api.umbrella.com/auth/v2/token", {
            method: "POST",
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: "grant_type=client_credentials"
        });

        if (!tokenRes.ok) {
            const body = await tokenRes.text();
            console.error("Umbrella OAuth2 token exchange failed:", body);
            return null;
        }

        const data = await tokenRes.json();
        cachedToken = data.access_token;
        tokenExpiresAt = Date.now() + (data.expires_in * 1000);
        return cachedToken;
    } catch (e) {
        console.error("Umbrella OAuth2 connection exception:", e);
        return null;
    }
}

/**
 * Lookup domain security categorization via Cisco Umbrella Investigate API.
 * Falls back to local intelligence simulation if credentials are missing or call fails.
 */
export async function lookupDomainUmbrella(domain: string): Promise<UmbrellaCategorizationResponse> {
    const cleanDomain = domain.trim().toLowerCase();
    const token = await getUmbrellaAccessToken();

    if (!token) {
        console.warn("Umbrella credentials missing or OAuth2 exchange failed. Returning simulated lookup.");
        return {
            ...simulateUmbrellaLookup(cleanDomain),
            source: "simulated",
            error: "Umbrella API credentials missing or OAuth2 exchange failed"
        };
    }

    try {
        const url = `https://api.umbrella.com/investigate/v2/domains/categorization/${encodeURIComponent(cleanDomain)}?showLabels=true`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`
            },
            next: { revalidate: 300 } // Cache results for 5 minutes
        });

        if (!response.ok) {
            const errText = `${response.status} ${response.statusText}`;
            console.error(`Umbrella API error: ${errText}`);
            return {
                ...simulateUmbrellaLookup(cleanDomain),
                source: "simulated",
                error: `Umbrella API returned status: ${errText}`
            };
        }

        const data = await response.json();
        const domainData = data[cleanDomain];

        if (!domainData) {
            return { status: 0, categories: [], securityCategories: [], source: "live" };
        }

        return {
            status: Number(domainData.status),
            categories: domainData.content_categories || [],
            securityCategories: domainData.security_categories || [],
            source: "live"
        };
    } catch (error: any) {
        console.error("Umbrella Lookup Exception:", error);
        return {
            ...simulateUmbrellaLookup(cleanDomain),
            source: "simulated",
            error: `Connection failure: ${error.message || String(error)}`
        };
    }
}

/**
 * Fallback local intelligence simulator for Cisco Umbrella Investigate
 */
function simulateUmbrellaLookup(domain: string) {
    const maliciousKeywords = ["malware", "phishing", "ransomware", "c2", "hacker", "exploit", "trojan", "keylogger", "spyware"];
    const suspectTlds = [".xyz", ".top", ".club", ".country", ".gq", ".tk", ".cf", ".work"];

    const isMaliciousKeyword = maliciousKeywords.some(keyword => domain.includes(keyword));
    const isSuspectTld = suspectTlds.some(tld => domain.endsWith(tld));

    if (isMaliciousKeyword) {
        return {
            status: -1,
            categories: ["Malware Distribution", "Command and Control"],
            securityCategories: ["Botnet", "Malware"]
        };
    }

    if (isSuspectTld) {
        return {
            status: -1,
            categories: ["Spam", "Suspicious Activity"],
            securityCategories: ["Phishing"]
        };
    }

    // Default to clean/benign for well-known domains or general domains
    const commonBenign = ["google.com", "microsoft.com", "github.com", "cisco.com", "apple.com", "nextjs.org", "wikipedia.org"];
    if (commonBenign.some(d => domain.includes(d))) {
        return {
            status: 1,
            categories: ["Search Engines", "Technology", "Software/Hardware"],
            securityCategories: []
        };
    }

    return {
        status: 0,
        categories: ["Business and Economy"],
        securityCategories: []
    };
}
