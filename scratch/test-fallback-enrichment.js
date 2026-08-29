const axios = require('axios');

async function testFallback(ip) {
    console.log("Testing fallback for", ip);

    // Primary: iplocate.io
    let data = null;
    const apiKey = process.env.IPLOCATE_API_KEY;
    try {
        const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
            headers: apiKey ? { "X-API-KEY": apiKey } : {},
            timeout: 4000
        });
        if (res.data && res.data.country) {
            data = res.data;
            console.log("-> iplocate.io success:", data.country, data.city);
        }
    } catch (e) {
        console.log("-> iplocate.io failed:", e.message);
    }

    // Secondary Fallback: ip-api.com
    if (!data) {
        try {
            const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,as`, {
                timeout: 4000
            });
            if (res.data && res.data.status === 'success') {
                const d = res.data;
                const rawAsn = d.as ? d.as.split(' ')[0] : null;
                const orgName = d.isp || d.org || d.as || null;
                data = {
                    country: d.country,
                    country_code: d.countryCode,
                    city: d.city,
                    subdivision: d.regionName,
                    latitude: d.lat,
                    longitude: d.lon,
                    asn: {
                        asn: rawAsn,
                        name: orgName,
                        domain: null
                    },
                    company: {
                        name: orgName
                    }
                };
                console.log("-> ip-api.com fallback success:", data.country, data.city, orgName);
            }
        } catch (e) {
            console.log("-> ip-api.com failed:", e.message);
        }
    }

    return data;
}

testFallback('95.164.206.108');
