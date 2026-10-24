import { Client } from "ldapts";
import logger from "@/lib/logger";

function escapeLDAPSearchFilter(input: string): string {
    return String(input).replace(/[\*\(\)\\\0]/g, match => {
        switch (match) {
            case '*': return '\\2a';
            case '(': return '\\28';
            case ')': return '\\29';
            case '\\': return '\\5c';
            case '\0': return '\\00';
            default: return match;
        }
    });
}

/**
 * Validates a username and password against an Active Directory / LDAP server.
 */
export async function authenticateWithAD(username: string, password: string): Promise<{ isValid: boolean; groups: string[] }> {
    // Sanitize username by stripping the @cooperhealth.edu suffix case-insensitively
    const cleanUsername = username.toLowerCase().endsWith("@cooperhealth.edu")
        ? username.slice(0, -17)
        : username;

    const url = process.env.AD_URL!;
    const bindDN = process.env.AD_BIND_DN!;
    const bindPassword = process.env.AD_BIND_PASSWORD!;
    const baseDN = process.env.AD_BASE_DN!;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED! !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN) {
        logger.error("LDAP configuration missing in environment variables.");
        return { isValid: false, groups: [] };
    }

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        logger.info(`LDAP: Attempting service account bind to ${url} with DN: ${bindDN}`);
        // Step 1: Bind with service account
        await client.bind(bindDN, bindPassword);
        logger.info("LDAP: Service account bind successful.");

        logger.info(`LDAP: Searching for user "${cleanUsername}" (original: "${username}") in baseDN "${baseDN}"`);
        // Step 2: Search for the user to get their full DN and groups
        // We search both sAMAccountName and userPrincipalName to be robust
        const escapedUsername = escapeLDAPSearchFilter(cleanUsername);
        const escapedOriginal = escapeLDAPSearchFilter(username);
        const { searchEntries } = await client.search(baseDN, {
            filter: `(|(sAMAccountName=${escapedUsername})(userPrincipalName=${escapedUsername}@cooperhealth.edu)(userPrincipalName=${escapedOriginal}))`,
            scope: "sub",
            attributes: ["dn", "memberOf"],
        });
        logger.info(`LDAP: Search returned ${searchEntries.length} results.`);

        if (searchEntries.length === 0) {
            logger.warn(`LDAP User not found: ${username}`);
            return { isValid: false, groups: [] };
        }

        const userDN = searchEntries[0].dn;
        const memberOfRaw = searchEntries[0].memberOf;
        const groups: string[] = [];
        if (memberOfRaw) {
            if (Array.isArray(memberOfRaw)) {
                groups.push(...memberOfRaw.map(g => String(g)));
            } else {
                groups.push(String(memberOfRaw));
            }
        }

        // Step 3: Bind with user's DN and their password
        // We reuse the same client or create a new one to verify credentials
        const authClient = new Client({
            url,
            tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
        });

        logger.info(`LDAP: Attempting user bind with DN: ${userDN}`);
        try {
            await authClient.bind(userDN, password);
            logger.info(`LDAP: User ${username} authentication SUCCESSFUL.`);
            return { isValid: true, groups };
        } catch (err: any) {
            logger.warn(`LDAP Authentication failed for ${username}:`, err.message);
            return { isValid: false, groups: [] };
        } finally {
            await authClient.unbind();
        }
    } catch (err: any) {
        logger.error("LDAP Error:", err.message);
        return { isValid: false, groups: [] };
    } finally {
        try {
            await client.unbind();
        } catch (e: any) {
            // Ignore unbind errors if already destroyed
        }
    }
}
/**
 * Fetches specific user details (department, title, etc.) for session enrichment.
 * Does NOT perform user authentication, uses service account bind only.
 */
export async function getUserDetails(username: string) {
    const url = process.env.AD_URL!;
    const bindDN = process.env.AD_BIND_DN!;
    const bindPassword = process.env.AD_BIND_PASSWORD!;
    const baseDN = process.env.AD_BASE_DN!;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED! !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN) {
        return null;
    }

    // Sanitize username by stripping the @cooperhealth.edu suffix case-insensitively
    const cleanUsername = username.toLowerCase().endsWith("@cooperhealth.edu")
        ? username.slice(0, -17)
        : username;

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        await client.bind(bindDN, bindPassword);
        
        const escapedUsername = escapeLDAPSearchFilter(cleanUsername);
        const escapedOriginal = escapeLDAPSearchFilter(username);
        
        const { searchEntries } = await client.search(baseDN, {
            filter: `(|(sAMAccountName=${escapedUsername})(userPrincipalName=${escapedUsername}@cooperhealth.edu)(userPrincipalName=${escapedOriginal}))`,
            scope: "sub",
            attributes: ["displayName", "department", "title", "telephoneNumber", "mail", "lockoutTime", "sAMAccountName", "userPrincipalName", "userAccountControl"],
        });

        if (searchEntries.length === 0) {
            return {
                exists: false,
                sAMAccountName: cleanUsername,
                userPrincipalName: "",
                displayName: "Account Not Found",
                department: "",
                title: "",
                phone: "",
                email: "",
                isEnabled: false,
                isLockedOut: false,
            };
        }

        const entry = searchEntries[0];
        const uac = Number(entry.userAccountControl || 0);
        return {
            exists: true,
            sAMAccountName: String(entry.sAMAccountName || cleanUsername),
            userPrincipalName: String(entry.userPrincipalName || ""),
            displayName: String(entry.displayName || ""),
            department: String(entry.department || ""),
            title: String(entry.title || ""),
            phone: String(entry.telephoneNumber || ""),
            email: String(entry.mail || ""),
            isEnabled: !(uac & 2),
            isLockedOut: entry.lockoutTime && String(entry.lockoutTime) !== "0" && parseInt(String(entry.lockoutTime), 10) > 0 ? true : false,
        };
    } catch (err: any) {
        logger.error("LDAP Enrichment Error:", err.message);
        return null;
    } finally {
        try { await client.unbind(); } catch (e: any) { }
    }
}
/**
 * Fetches details for multiple users in batches to optimize LDAP performance.
 */
export async function getBulkUserDetails(emails: string[]) {
    const url = process.env.AD_URL!;
    const bindDN = process.env.AD_BIND_DN!;
    const bindPassword = process.env.AD_BIND_PASSWORD!;
    const baseDN = process.env.AD_BASE_DN!;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED! !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN || emails.length === 0) {
        return {};
    }

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    const results: Record<string, any> = {};

    try {
        await client.bind(bindDN, bindPassword);

        // Batch size of 50 to avoid LDAP filter length limits
        for (let i = 0; i < emails.length; i += 50) {
            const batch = emails.slice(i, i + 50).map(escapeLDAPSearchFilter);
            const filter = `(|${batch.map(e => `(mail=${e})`).join("")})`;

            const { searchEntries } = await client.search(baseDN, {
                filter,
                scope: "sub",
                attributes: ["displayName", "department", "title", "mail", "userAccountControl", "lockoutTime", "description", "pwdLastSet"],
            });

            searchEntries.forEach(entry => {
                const email = String(entry.mail || "").toLowerCase();
                if (!email) return;

                const uac = Number(entry.userAccountControl || 0);
                const lockout = String(entry.lockoutTime || "0");
                const pwdLastSet = String(entry.pwdLastSet || "0");

                // AD Timestamp conversion (100-nanosecond intervals since Jan 1, 1601)
                let pwdLastSetDate = "Never";
                if (pwdLastSet !== "0") {
                    const ticks = BigInt(pwdLastSet);
                    const epochTicks = BigInt("116444736000000000"); // ticks from 1601 to 1970
                    const unixMs = Number((ticks - epochTicks) / BigInt(10000));
                    pwdLastSetDate = new Date(unixMs).toLocaleString();
                }

                results[email] = {
                    displayName: String(entry.displayName || ""),
                    department: String(entry.department || ""),
                    title: String(entry.title || ""),
                    description: String(entry.description || ""),
                    enabled: !(uac & 2),
                    locked: lockout !== "0",
                    pwdLastSet: pwdLastSetDate,
                    email: email
                };
            });
        }
    } catch (err: any) {
        logger.error("LDAP Bulk Enrichment Error:", err.message);
    } finally {
        try { await client.unbind(); } catch (e: any) { }
    }

    return results;
}

/**
 * Performs fast batch Active Directory verification for an array of usernames.
 * Returns AD Account Status ("ACTIVE", "DISABLED", "NOT_FOUND"), displayName, department, title, and timestamp.
 */
export async function getBulkUserAdStatus(rawUsernames: string[]): Promise<Record<string, { adStatus: "ACTIVE" | "DISABLED" | "NOT_FOUND"; displayName: string; department: string; title: string; adLastCheckedAt: string }>> {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false";

    const results: Record<string, { adStatus: "ACTIVE" | "DISABLED" | "NOT_FOUND"; displayName: string; department: string; title: string; adLastCheckedAt: string }> = {};
    const nowIso = new Date().toISOString();

    if (!url || !bindDN || !bindPassword || !baseDN || rawUsernames.length === 0) {
        return results;
    }

    // Map every normalized variation back to all raw inputs that requested it
    const cleanUserMap = new Map<string, Set<string>>(); // searchToken -> Set<rawInput>

    const registerMapping = (token: string, raw: string) => {
        if (!token) return;
        const lower = token.trim().toLowerCase();
        if (!lower) return;
        if (!cleanUserMap.has(lower)) {
            cleanUserMap.set(lower, new Set());
        }
        cleanUserMap.get(lower)!.add(raw);
    };

    for (const raw of rawUsernames) {
        if (!raw) continue;
        const trimmed = raw.trim();
        // Default entry to NOT_FOUND
        results[raw] = {
            adStatus: "NOT_FOUND",
            displayName: "Not Found in AD",
            department: "",
            title: "",
            adLastCheckedAt: nowIso
        };

        // 1. Direct raw lowercase
        registerMapping(trimmed, raw);

        // 2. Strip domain prefix (e.g. COOPER\user, CUH\\user, CUH/user)
        const noDomainPrefix = trimmed.replace(/^[a-zA-Z0-9_\-\.]+[\\\/]+/, "");
        registerMapping(noDomainPrefix, raw);

        // 3. Strip NetScaler domain suffix (e.g. user:cooper, user:CUH)
        const noDomainSuffix = noDomainPrefix.replace(/:[a-zA-Z0-9_\-\.]+$/, "");
        registerMapping(noDomainSuffix, raw);

        // 4. Strip UPN / Email domain suffix (e.g. user@cooperhealth.edu)
        if (noDomainSuffix.includes("@")) {
            const upnPrefix = noDomainSuffix.split("@")[0];
            registerMapping(upnPrefix, raw);
        } else {
            // Also register with standard corporate UPN domain
            registerMapping(`${noDomainSuffix}@cooperhealth.edu`, raw);
        }
    }

    const searchTokens = Array.from(cleanUserMap.keys());
    if (searchTokens.length === 0) return results;

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        await client.bind(bindDN, bindPassword);

        // Batch search Active Directory in chunks of 30
        for (let i = 0; i < searchTokens.length; i += 30) {
            const batch = searchTokens.slice(i, i + 30).map(escapeLDAPSearchFilter);
            
            // Search across sAMAccountName, userPrincipalName, and mail
            const subFilters = batch.map(u => 
                `(|(sAMAccountName=${u})(userPrincipalName=${u})(userPrincipalName=${u}@cooperhealth.edu)(mail=${u})(mail=${u}@cooperhealth.edu))`
            );
            const filter = `(|${subFilters.join("")})`;

            const { searchEntries } = await client.search(baseDN, {
                filter,
                scope: "sub",
                attributes: ["sAMAccountName", "userPrincipalName", "mail", "displayName", "department", "title", "userAccountControl"],
            });

            searchEntries.forEach(entry => {
                const sName = String(entry.sAMAccountName || "").toLowerCase();
                const upn = String(entry.userPrincipalName || "").toLowerCase();
                const upnPrefix = upn.split("@")[0];
                const mail = String(entry.mail || "").toLowerCase();
                const mailPrefix = mail.split("@")[0];

                // Gather all matching original raw input usernames
                const matchedRawUsernames = new Set<string>();
                [sName, upn, upnPrefix, mail, mailPrefix].forEach(key => {
                    if (key && cleanUserMap.has(key)) {
                        cleanUserMap.get(key)!.forEach(raw => matchedRawUsernames.add(raw));
                    }
                });

                if (matchedRawUsernames.size === 0) return;

                const uac = Number(entry.userAccountControl || 0);
                const isEnabled = !(uac & 2);

                const adInfo = {
                    adStatus: isEnabled ? ("ACTIVE" as const) : ("DISABLED" as const),
                    displayName: String(entry.displayName || entry.sAMAccountName || ""),
                    department: String(entry.department || ""),
                    title: String(entry.title || ""),
                    adLastCheckedAt: nowIso
                };

                for (const raw of matchedRawUsernames) {
                    results[raw] = adInfo;
                }
            });
        }
    } catch (err: any) {
        logger.error("LDAP Bulk User AD Status Lookup Error:", err.message || err);
    } finally {
        try { await client.unbind(); } catch (e: any) { }
    }

    return results;
}

export interface AdComputerDetails {
    exists: boolean;
    name: string;
    dnsHostName?: string;
    operatingSystem?: string;
    operatingSystemVersion?: string;
    distinguishedName?: string;
    ou?: string;
}

/**
 * Searches Active Directory for a computer account by hostname or sAMAccountName.
 */
export async function getComputerDetails(rawName: string): Promise<AdComputerDetails | null> {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;

    if (!url || !bindDN || !bindPassword || !baseDN || !rawName) {
        return null;
    }

    const clean = rawName.split('.')[0].replace(/\$$/, '').trim();
    if (!clean) return null;

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized: process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });

    try {
        await client.bind(bindDN, bindPassword);
        const escaped = escapeLDAPSearchFilter(clean);
        const { searchEntries } = await client.search(baseDN, {
            filter: `(&(objectClass=computer)(|(sAMAccountName=${escaped}$)(cn=${escaped})))`,
            scope: "sub",
            attributes: ["cn", "dNSHostName", "operatingSystem", "operatingSystemVersion", "distinguishedName"],
        });

        if (searchEntries.length === 0) {
            return { exists: false, name: clean };
        }

        const e = searchEntries[0];
        const dn = String(e.distinguishedName || "");
        const ouMatch = dn.match(/OU=([^,]+)/);
        const ou = ouMatch ? ouMatch[1].replace(/^_/, '') : "Domain Computers";

        return {
            exists: true,
            name: String(e.cn || clean),
            dnsHostName: String(e.dNSHostName || ""),
            operatingSystem: String(e.operatingSystem || "Windows"),
            operatingSystemVersion: String(e.operatingSystemVersion || ""),
            distinguishedName: dn,
            ou,
        };
    } catch (err: any) {
        logger.error(`LDAP: Failed to lookup computer details for ${clean}:`, err.message);
        return { exists: false, name: clean };
    } finally {
        try { await client.unbind(); } catch (e: any) { }
    }
}

