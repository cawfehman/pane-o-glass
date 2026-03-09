const { Client } = require("ldapts");
require("dotenv").config();

async function testLDAP() {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;
    const username = process.argv[2] || "your-test-username";
    const password = process.argv[3] || "your-test-password";
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false";

    console.log("--- LDAP Test Setup ---");
    console.log(`URL: ${url}`);
    console.log(`Bind DN: ${bindDN}`);
    console.log(`Base DN: ${baseDN}`);
    console.log(`Reject Unauthorized: ${rejectUnauthorized}`);
    console.log(`Testing with user: ${username}`);
    console.log("------------------------");

    if (!url || !bindDN || !bindPassword || !baseDN) {
        console.error("Missing LDAP configuration. Check your .env file.");
        return;
    }

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
    });

    try {
        console.log("1. Attempting service account bind...");
        await client.bind(bindDN, bindPassword);
        console.log("SUCCESS: Service account bind successful.\n");

        console.log(`2. Searching for user: ${username}...`);
        const { searchEntries } = await client.search(baseDN, {
            filter: `(sAMAccountName=${username})`,
            scope: "sub",
            attributes: ["dn"],
        });

        if (searchEntries.length === 0) {
            console.error(`FAILED: User ${username} not found in baseDN.`);
            return;
        }

        const userDN = searchEntries[0].dn;
        console.log(`SUCCESS: User found. DN: ${userDN}\n`);

        console.log("3. Attempting user authentication bind...");
        const authClient = new Client({
            url,
            tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
        });

        try {
            await authClient.bind(userDN, password);
            console.log(`SUCCESS: User ${username} authenticated successfully!`);
        } catch (err) {
            console.error(`FAILED: User authentication failed: ${err.message}`);
        } finally {
            await authClient.unbind();
        }

    } catch (err) {
        console.error(`ERROR: LDAP operation failed: ${err.message}`);
        if (err.stack) console.log(err.stack);
    } finally {
        try {
            await client.unbind();
        } catch (e) {}
    }
}

testLDAP();
