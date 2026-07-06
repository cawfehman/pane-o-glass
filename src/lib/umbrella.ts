/**
 * Cisco Umbrella Investigate API Client
 */

export interface UmbrellaCategorizationResponse {
    status: number; // -1 for malicious, 0 for uncategorized, 1 for benign
    categories: string[];
    securityCategories: string[];
}

/**
 * Lookup domain security categorization via Cisco Umbrella Investigate API.
 * Falls back to local intelligence simulation if credentials are missing.
 */
export async function lookupDomainUmbrella(domain: string): Promise<UmbrellaCategorizationResponse> {
    const token = process.env.CISCO_UMBRELLA_API_TOKEN;
    const cleanDomain = domain.trim().toLowerCase();

    if (!token) {
        console.warn("CISCO_UMBRELLA_API_TOKEN is missing. Returning simulated lookup.");
        return simulateUmbrellaLookup(cleanDomain);
    }

    try {
        const url = `https://investigate.api.umbrella.com/domains/categorization/${encodeURIComponent(cleanDomain)}?showLabels`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`
            },
            next: { revalidate: 300 } // Cache results for 5 minutes
        });

        if (!response.ok) {
            console.error(`Umbrella API error: ${response.status} ${response.statusText}`);
            return simulateUmbrellaLookup(cleanDomain);
        }

        const data = await response.json();
        const domainData = data[cleanDomain];

        if (!domainData) {
            return { status: 0, categories: [], securityCategories: [] };
        }

        return {
            status: Number(domainData.status),
            categories: domainData.content_categories || [],
            securityCategories: domainData.security_categories || []
        };
    } catch (error) {
        console.error("Umbrella Lookup Exception:", error);
        return simulateUmbrellaLookup(cleanDomain);
    }
}

/**
 * Fallback local intelligence simulator for Cisco Umbrella Investigate
 */
function simulateUmbrellaLookup(domain: string): UmbrellaCategorizationResponse {
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
