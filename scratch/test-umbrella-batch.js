const { lookupDomainUmbrella } = require('../src/lib/umbrella');

async function testUmbrella() {
    console.log("Testing Cisco Umbrella domain lookup...");
    const domains = ["fonts.gstatic.com", "ebgaffiliates.com", "phishing-test-site.xyz", "google.com"];
    for (const d of domains) {
        const res = await lookupDomainUmbrella(d);
        console.log(`Domain: ${d} -> Status: ${res.status} (${res.status === -1 ? 'MALICIOUS' : res.status === 1 ? 'BENIGN' : 'UNCATEGORIZED'}), Categories: ${res.categories.join(', ')}, Security: ${res.securityCategories.join(', ')} [Source: ${res.source}]`);
    }
}

testUmbrella();
