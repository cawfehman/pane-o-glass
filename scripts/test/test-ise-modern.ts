import { fetchIseSession, getTrustSecSgtMap, getIseUrls } from '../../src/lib/ise';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
    console.log("==================================================");
    console.log("Testing Modernized ISE 3.5 Integration");
    console.log("==================================================");

    // 1. Test URLs & Failover config
    const urls = getIseUrls();
    console.log(`[Config] Primary PAN:   ${urls.primary}`);
    console.log(`[Config] Secondary PAN: ${urls.secondary}`);

    // 2. Test TrustSec SGT Dictionary
    console.log("\n[1/3] Fetching TrustSec SGT Dictionary...");
    const sgtMap = await getTrustSecSgtMap();
    console.log(`[SGT] Cached ${Object.keys(sgtMap).length} Security Groups.`);
    const sampleKeys = Object.keys(sgtMap).slice(0, 5);
    for (const k of sampleKeys) {
        console.log(`      Tag ${k} -> ${sgtMap[Number(k)]}`);
    }

    // 3. Test Live Session Lookup with ERS on Port 443
    // Using the live active MAC from our earlier probe
    const testMac = "CE:F0:EE:05:8E:DE";
    console.log(`\n[2/3] Fetching Live Session for MAC: ${testMac}...`);
    const sessionRes = await fetchIseSession(testMac);
    console.log(`[Session] Found: ${sessionRes.found}`);
    if (sessionRes.found && sessionRes.sessions?.[0]) {
        const s = sessionRes.sessions[0];
        console.log(`[Session] User:       ${s.user_name}`);
        console.log(`[Session] MAC:        ${s.calling_station_id}`);
        console.log(`[Session] Profile:    ${s.endpoint_profile}`);
        console.log(`[Session] Model:      ${s.hardware_model || "None"}`);
        console.log(`[Session] Mfr:        ${s.hardware_manufacturer || "None"}`);
        console.log(`[Session] OS:         ${s.os_version || "None"}`);
        console.log(`[Session] SGT:        ${s.security_group} (Name: ${s.sgt_name})`);
        console.log(`[Session] AP / SSID:  ${s.access_point_name} / ${s.wlan_ssid}`);
    }

    console.log("\n==================================================");
    console.log("Modernized ISE 3.5 Test Complete");
    console.log("==================================================");
}

runTest().catch(console.error);
