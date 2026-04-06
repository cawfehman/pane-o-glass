import { Client } from "ldapts";

/**
 * Validates a username and password against an Active Directory / LDAP server.
 */
export async function authenticateWithAD(username: string, password: string): Promise<boolean> {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN) {
        console.error("LDAP configuration missing in environment variables.");
        return false;
    }

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        console.log(`LDAP: Attempting service account bind to ${url} with DN: ${bindDN}`);
        // Step 1: Bind with service account
        await client.bind(bindDN, bindPassword);
        console.log("LDAP: Service account bind successful.");

        console.log(`LDAP: Searching for user "${username}" in baseDN "${baseDN}"`);
        // Step 2: Search for the user to get their full DN
        // We search both sAMAccountName and userPrincipalName to be robust
        const { searchEntries } = await client.search(baseDN, {
            filter: `(|(sAMAccountName=${username})(userPrincipalName=${username}))`,
            scope: "sub",
            attributes: ["dn"],
        });
        console.log(`LDAP: Search returned ${searchEntries.length} results.`);

        if (searchEntries.length === 0) {
            console.warn(`LDAP User not found: ${username}`);
            return false;
        }

        const userDN = searchEntries[0].dn;

        // Step 3: Bind with user's DN and their password
        // We reuse the same client or create a new one to verify credentials
        const authClient = new Client({
            url,
            tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
        });

        console.log(`LDAP: Attempting user bind with DN: ${userDN}`);
        try {
            await authClient.bind(userDN, password);
            console.log(`LDAP: User ${username} authentication SUCCESSFUL.`);
            return true;
        } catch (err: any) {
            console.warn(`LDAP Authentication failed for ${username}:`, err.message);
            return false;
        } finally {
            await authClient.unbind();
        }
    } catch (err: any) {
        console.error("LDAP Error:", err.message);
        return false;
    } finally {
        try {
            await client.unbind();
        } catch (e) {
            // Ignore unbind errors if already destroyed
        }
    }
}
/**
 * Fetches specific user details (department, title, etc.) for session enrichment.
 * Does NOT perform user authentication, uses service account bind only.
 */
export async function getUserDetails(username: string) {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN) {
        return null;
    }

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        await client.bind(bindDN, bindPassword);
        
        const { searchEntries } = await client.search(baseDN, {
            filter: `(|(sAMAccountName=${username})(userPrincipalName=${username}))`,
            scope: "sub",
            attributes: ["displayName", "department", "title", "telephoneNumber", "mail"],
        });

        if (searchEntries.length === 0) return null;

        const entry = searchEntries[0];
        return {
            displayName: String(entry.displayName || ""),
            department: String(entry.department || ""),
            title: String(entry.title || ""),
            phone: String(entry.telephoneNumber || ""),
            email: String(entry.mail || ""),
        };
    } catch (err: any) {
        console.error("LDAP Enrichment Error:", err.message);
        return null;
    } finally {
        try { await client.unbind(); } catch (e) { }
    }
}
