import dgram from 'dgram';

export interface WlcClientTelemetry {
    found: boolean;
    wlcName?: string;
    wlcIp?: string;
    mac?: string;
    status?: string; // Associated, Authenticated, Disassociated, Blacklisted, etc.
    statusRaw?: number;
    apName?: string;
    apLocation?: string;
    apMac?: string;
    ssid?: string;
    rssi?: number; // in dBm
    snr?: number; // in dB
    ipAddress?: string;
    policyType?: string; // e.g. "8021X_REQD"
    interface?: string; // e.g. "wifi_spc-2"
    excluded?: boolean;
    exclusionReason?: string;
    protocol?: string;
    latencyMs?: number;
}

// AireOS AIRESPACE-WIRELESS-MIB Mobile Station status definitions (bsnMobileStationStatus .15)
const AIREOS_STATUS_MAP: Record<number, string> = {
    0: 'Idle (Associated)',
    1: 'AAA Pending',
    2: 'Authenticated',
    3: 'Associated (RUN)',
    4: 'Powersave',
    5: 'Disassociated',
    6: 'To Be Deleted',
    7: 'Probing',
    8: 'Blacklisted / Excluded'
};

function parseMacToOid(mac: string): number[] | null {
    const clean = mac.replace(/[:-]/g, '').toLowerCase();
    if (clean.length !== 12) return null;
    const bytes: number[] = [];
    for (let i = 0; i < 12; i += 2) {
        bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return bytes;
}

// Build standard SNMPv2c GetRequest PDU
function buildSnmpGetPacket(community: string, oidBytes: number[], reqIdVal: number = 0x01020304): Buffer {
    const commBuf = Buffer.from(community);
    
    let encodedOid: number[] = [];
    if (oidBytes.length >= 2) {
        encodedOid.push(oidBytes[0] * 40 + oidBytes[1]);
        for (let i = 2; i < oidBytes.length; i++) {
            let val = oidBytes[i];
            if (val < 128) {
                encodedOid.push(val);
            } else {
                const subBytes: number[] = [];
                subBytes.push(val & 0x7f);
                val = val >> 7;
                while (val > 0) {
                    subBytes.unshift((val & 0x7f) | 0x80);
                    val = val >> 7;
                }
                encodedOid.push(...subBytes);
            }
        }
    }

    const vbOid = Buffer.concat([Buffer.from([0x06, encodedOid.length]), Buffer.from(encodedOid)]);
    const vbVal = Buffer.from([0x05, 0x00]); // Null
    const varBind = Buffer.concat([Buffer.from([0x30, vbOid.length + vbVal.length]), vbOid, vbVal]);
    const vbl = Buffer.concat([Buffer.from([0x30, varBind.length]), varBind]);

    const reqId = Buffer.from([0x02, 0x04, (reqIdVal >> 24) & 0xff, (reqIdVal >> 16) & 0xff, (reqIdVal >> 8) & 0xff, reqIdVal & 0xff]);
    const errStat = Buffer.from([0x02, 0x01, 0x00]);
    const errIdx = Buffer.from([0x02, 0x01, 0x00]);
    const pduPayload = Buffer.concat([reqId, errStat, errIdx, vbl]);
    const pdu = Buffer.concat([Buffer.from([0xa0, pduPayload.length]), pduPayload]);

    const version = Buffer.from([0x02, 0x01, 0x01]); // 1 = v2c
    const commSeq = Buffer.concat([Buffer.from([0x04, commBuf.length]), commBuf]);
    const msgPayload = Buffer.concat([version, commSeq, pdu]);
    return Buffer.concat([Buffer.from([0x30, msgPayload.length]), msgPayload]);
}

// Single-OID SNMP query with fast promise timeout
async function snmpGet(ip: string, community: string, oidParts: number[], timeoutMs: number = 1500): Promise<{ buffer: Buffer; rtt: number } | null> {
    return new Promise((resolve) => {
        const start = Date.now();
        const client = dgram.createSocket('udp4');
        let done = false;

        const packet = buildSnmpGetPacket(community, oidParts);

        const timer = setTimeout(() => {
            if (!done) {
                done = true;
                try { client.close(); } catch(e) {}
                resolve(null);
            }
        }, timeoutMs);

        client.on('message', (msg) => {
            if (!done) {
                done = true;
                clearTimeout(timer);
                const rtt = Date.now() - start;
                try { client.close(); } catch(e) {}
                resolve({ buffer: msg, rtt });
            }
        });

        client.on('error', () => {
            if (!done) {
                done = true;
                clearTimeout(timer);
                try { client.close(); } catch(e) {}
                resolve(null);
            }
        });

        client.send(packet, 0, packet.length, 161, ip, (err) => {
            if (err && !done) {
                done = true;
                clearTimeout(timer);
                try { client.close(); } catch(e) {}
                resolve(null);
            }
        });
    });
}

// Robust ASN.1 BER parser for Response-PDU VarBind value
function parseVarBindValue(resBuf: Buffer): { type: number; val: any } | null {
    try {
        const pduIdx = resBuf.indexOf(0xa2);
        if (pduIdx === -1) return null;

        const oidIdx = resBuf.indexOf(0x06, pduIdx);
        if (oidIdx === -1) return null;
        const oidLen = resBuf[oidIdx + 1];
        const valTagIdx = oidIdx + 2 + oidLen;
        if (valTagIdx >= resBuf.length) return null;

        const valTag = resBuf[valTagIdx];
        if (valTag >= 0x80) {
            // SNMP Exception (noSuchObject / noSuchInstance / endOfMibView)
            return null;
        }

        let valLen = resBuf[valTagIdx + 1];
        let offset = valTagIdx + 2;

        // Long form length handling
        if (valLen > 128) {
            const numLenBytes = valLen - 128;
            valLen = 0;
            for (let i = 0; i < numLenBytes; i++) {
                valLen = (valLen << 8) | resBuf[offset++];
            }
        }

        const valBytes = resBuf.slice(offset, offset + valLen);

        if (valTag === 0x02) { // INTEGER
            if (valLen === 1) return { type: valTag, val: valBytes.readInt8(0) };
            if (valLen === 2) return { type: valTag, val: valBytes.readInt16BE(0) };
            if (valLen === 4) return { type: valTag, val: valBytes.readInt32BE(0) };
            return { type: valTag, val: 0 };
        } else if (valTag === 0x04) { // OCTET STRING
            const isAscii = valBytes.every(b => (b >= 32 && b <= 126) || b === 10 || b === 13);
            if (isAscii) {
                return { type: valTag, val: valBytes.toString('utf8').trim() };
            }
            if (valBytes.length === 6) {
                return { type: valTag, val: Array.from(valBytes).map(b => b.toString(16).padStart(2, '0')).join(':') };
            }
            return { type: valTag, val: valBytes.toString('hex') };
        } else if (valTag === 0x40) { // IpAddress
            return { type: valTag, val: Array.from(valBytes).join('.') };
        } else if (valTag === 0x41 || valTag === 0x42) { // Counter32 or Gauge32
            if (valLen === 1) return { type: valTag, val: valBytes.readUInt8(0) };
            if (valLen === 2) return { type: valTag, val: valBytes.readUInt16BE(0) };
            if (valLen === 4) return { type: valTag, val: valBytes.readUInt32BE(0) };
            return { type: valTag, val: 0 };
        } else if (valTag === 0x43) { // TimeTicks
            return { type: valTag, val: valBytes.readUInt32BE(0) };
        }

        return { type: valTag, val: valBytes };
    } catch {
        return null;
    }
}

export async function fetchWlcClientTelemetry(mac: string): Promise<WlcClientTelemetry> {
    const macBytes = parseMacToOid(mac);
    if (!macBytes) {
        return { found: false };
    }

    const clean = (s: string) => s.replace(/^"|"$/g, '').trim();
    const community = clean(process.env.WLC_SNMP_COMMUNITY || 'InfoSecUtil-02a');
    const controllers = [
        { name: 'KEL-2MC-WLC-CAMPUS', ip: clean(process.env.WLC_CAMPUS_IP || '172.18.163.99') },
        { name: 'KEL-2MC-WLC-AMB', ip: clean(process.env.WLC_AMB_IP || '172.18.163.105') }
    ];

    // OIDs for AIRESPACE-WIRELESS-MIB bsnMobileStationTable (1.3.6.1.4.1.14179.2.1.4.1)
    const baseOid = [1, 3, 6, 1, 4, 1, 14179, 2, 1, 4, 1];

    for (const ctrl of controllers) {
        try {
            // First check if MAC exists in bsnMobileStationTable via bsnMobileStationSsid (.7)
            const ssidOid = [...baseOid, 7, ...macBytes];
            const ssidRes = await snmpGet(ctrl.ip, community, ssidOid, 1200);

            if (ssidRes) {
                const parsedSsid = parseVarBindValue(ssidRes.buffer);
                if (parsedSsid && typeof parsedSsid.val === 'string' && parsedSsid.val.length > 0) {
                    const ssid = parsedSsid.val;

                    // Parallel query for remaining client fields:
                    // .2 = IP, .4 = AP MAC, .15 = Status, .23 = Policy Type, .27 = Interface, .31 = RSSI
                    const [ipRes, apMacRes, statusRes, policyRes, intfRes, rssiRes] = await Promise.all([
                        snmpGet(ctrl.ip, community, [...baseOid, 2, ...macBytes], 1000),
                        snmpGet(ctrl.ip, community, [...baseOid, 4, ...macBytes], 1000),
                        snmpGet(ctrl.ip, community, [...baseOid, 15, ...macBytes], 1000),
                        snmpGet(ctrl.ip, community, [...baseOid, 23, ...macBytes], 1000),
                        snmpGet(ctrl.ip, community, [...baseOid, 27, ...macBytes], 1000),
                        snmpGet(ctrl.ip, community, [...baseOid, 31, ...macBytes], 1000),
                    ]);

                    const ipVal = ipRes ? parseVarBindValue(ipRes.buffer)?.val : undefined;
                    const apMacRaw = apMacRes ? parseVarBindValue(apMacRes.buffer)?.val : undefined;
                    const statusVal = statusRes ? parseVarBindValue(statusRes.buffer)?.val : 0;
                    const policyVal = policyRes ? parseVarBindValue(policyRes.buffer)?.val : undefined;
                    const intfVal = intfRes ? parseVarBindValue(intfRes.buffer)?.val : undefined;
                    const rssiVal = rssiRes ? parseVarBindValue(rssiRes.buffer)?.val : undefined;

                    let apName: string | undefined = undefined;
                    let apLocation: string | undefined = undefined;
                    const apMacString: string | undefined = typeof apMacRaw === 'string' ? apMacRaw : undefined;

                    // Query bsnAPTable (1.3.6.1.4.1.14179.2.2.1.1) for AP Name (.3) and Location (.4)
                    if (apMacString) {
                        const apMacParts = parseMacToOid(apMacString);
                        if (apMacParts) {
                            const [apNameRes, apLocRes] = await Promise.all([
                                snmpGet(ctrl.ip, community, [1, 3, 6, 1, 4, 1, 14179, 2, 2, 1, 1, 3, ...apMacParts], 1000),
                                snmpGet(ctrl.ip, community, [1, 3, 6, 1, 4, 1, 14179, 2, 2, 1, 1, 4, ...apMacParts], 1000),
                            ]);

                            const pApName = apNameRes ? parseVarBindValue(apNameRes.buffer)?.val : undefined;
                            const pApLoc = apLocRes ? parseVarBindValue(apLocRes.buffer)?.val : undefined;
                            if (typeof pApName === 'string' && pApName) apName = pApName;
                            if (typeof pApLoc === 'string' && pApLoc) apLocation = pApLoc;
                        }
                    }

                    const rawStatusNum = typeof statusVal === 'number' ? statusVal : 0;
                    const statusText = AIREOS_STATUS_MAP[rawStatusNum] || `State (${rawStatusNum})`;

                    return {
                        found: true,
                        wlcName: ctrl.name,
                        wlcIp: ctrl.ip,
                        mac,
                        status: statusText,
                        statusRaw: rawStatusNum,
                        apName,
                        apLocation,
                        apMac: apMacString,
                        ssid,
                        policyType: typeof policyVal === 'string' ? policyVal : undefined,
                        interface: typeof intfVal === 'string' ? intfVal : undefined,
                        ipAddress: typeof ipVal === 'string' && ipVal !== '0.0.0.0' ? ipVal : undefined,
                        rssi: typeof rssiVal === 'number' && rssiVal !== 0 ? rssiVal : undefined,
                        excluded: rawStatusNum === 8,
                        exclusionReason: rawStatusNum === 8 ? 'WLC 802.11 Blacklist/Exclusion Threshold Triggered' : undefined,
                        latencyMs: ssidRes.rtt
                    };
                }
            }
        } catch {
            // Try next controller
        }
    }

    return { found: false };
}
