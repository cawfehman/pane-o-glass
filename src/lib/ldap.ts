import ldap from "ldapjs";

/**
 * Validates a username and password against an Active Directory / LDAP server.
 */
export async function authenticateWithAD(username: string, password: string): Promise<boolean> {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;

    if (!url || !bindDN || !bindPassword || !baseDN) {
        console.error("LDAP configuration missing in environment variables.");
        return false;
    }

    const client = ldap.createClient({ url });

    return new Promise((resolve) => {
        // Step 1: Bind with service account
        client.bind(bindDN, bindPassword, (err) => {
            if (err) {
                console.error("LDAP Bind Error (Service Account):", err.message);
                client.destroy();
                resolve(false);
                return;
            }

            // Step 2: Search for the user to get their full DN
            const searchOptions: ldap.SearchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: "sub",
                attributes: ["dn"]
            };

            client.search(baseDN, searchOptions, (err, res) => {
                if (err) {
                    console.error("LDAP Search Error:", err.message);
                    client.unbind();
                    resolve(false);
                    return;
                }

                let userDN = "";

                res.on("searchEntry", (entry) => {
                    userDN = entry.dn.toString();
                });

                res.on("error", (err) => {
                    console.error("LDAP Search Result Error:", err.message);
                    client.unbind();
                    resolve(false);
                });

                res.on("end", (result) => {
                    if (!userDN) {
                        console.warn(`LDAP User not found: ${username}`);
                        client.unbind();
                        resolve(false);
                        return;
                    }

                    // Step 3: Bind with user's DN and their password
                    const userClient = ldap.createClient({ url });
                    userClient.bind(userDN, password, (err) => {
                        userClient.unbind();
                        client.unbind();
                        
                        if (err) {
                            console.warn(`LDAP Authentication failed for ${username}:`, err.message);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
                });
            });
        });
    });
}
