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
        // Step 1: Bind with service account
        await client.bind(bindDN, bindPassword);

        // Step 2: Search for the user to get their full DN
        const { searchEntries } = await client.search(baseDN, {
            filter: `(sAMAccountName=${username})`,
            scope: "sub",
            attributes: ["dn"],
        });

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

        try {
            await authClient.bind(userDN, password);
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
