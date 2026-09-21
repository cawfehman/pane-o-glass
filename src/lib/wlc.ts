import dgram from 'dgram';

export interface WlcClientTelemetry {
    found: boolean;
    wlcName?: string;
    wlcIp?: string;
    mac?: string;
    status?: string; // Associated, Authenticated, Disassociated, Blacklisted, etc.
    statusRaw?: number;
    apName?: string;
    ssid?: string;
    rssi?: number; // in dBm
    snr?: number; // in dB
    ipAddress?: string;
    excluded?: boolean;
    exclusionReason?: string;
    protocol?: string;
    latencyMs?: number;
}

// AireOS AIRESPACE-WIRELESS-MIB Mobile Station status definitions
const AIREOS_STATUS_MAP: Record<number, string> = {
    0: 'Idle',
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
    
    // OID encoding
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

function parseSnmpInteger(resBuf: Buffer): number | null {
    try {
        // Look for Integer tag (0x02) inside varbind response
        // VarBindList starts after PDU headers
        const pduIdx = resBuf.indexOf(0xa2); // Response-PDU
        if (pduIdx === -1) return null;
        
        // Find 0x02 (INTEGER) near the end
        for (let i = resBuf.length - 1; i > pduIdx + 10; i--) {
            if (resBuf[i] === 0x02) {
                const len = resBuf[i + 1];
                if (len === 1) {
                    return resBuf.readInt8(i + 2);
                } else if (len === 2) {
                    return resBuf.readInt16BE(i + 2);
                } else if (len === 4) {
                    return resBuf.readInt32BE(i + 2);
                }
            }
        }
    } catch (e) {}
    return null;
}

function parseSnmpString(resBuf: Buffer): string | null {
    try {
        const pduIdx = resBuf.indexOf(0xa2);
        if (pduIdx === -1) return null;
        
        // Find 0x04 (OCTET STRING)
        for (let i = resBuf.length - 1; i > pduIdx + 10; i--) {
            if (resBuf[i] === 0x04) {
                const len = resBuf[i + 1];
                if (len > 0 && i + 2 + len <= resBuf.length) {
                    return resBuf.slice(i + 2, i + 2 + len).toString('utf8');
                }
            }
        }
    } catch (e) {}
    return null;
}

export async function fetchWlcClientTelemetry(mac: string): Promise<WlcClientTelemetry> {
    const macBytes = parseMacToOid(mac);
    if (!macBytes) {
        return { found: false };
    }

    const community = process.env.WLC_SNMP_COMMUNITY || 'InfoSecUtil-02a';
    const controllers = [
        { name: 'KEL-2MC-WLC-CAMPUS', ip: process.env.WLC_CAMPUS_IP || '172.18.163.99' },
        { name: 'KEL-2MC-WLC-AMB', ip: process.env.WLC_AMB_IP || '172.18.163.105' }
    ];

    // OIDs for bsnMobileStationTable (1.3.6.1.4.1.14179.2.1.4.1)
    // .1 = mac, .2 = ip, .4 = ssid, .7 = status, .25 = rssi, .26 = snr
    const baseOid = [1, 3, 6, 1, 4, 1, 14179, 2, 1, 4, 1];

    for (const ctrl of controllers) {
        try {
            // Check status first: bsnMobileStationStatus (1.3.6.1.4.1.14179.2.1.4.1.7.<mac>)
            const statusOid = [...baseOid, 7, ...macBytes];
            const statusRes = await snmpGet(ctrl.ip, community, statusOid, 1200);

            if (statusRes) {
                const rawStatus = parseSnmpInteger(statusRes.buffer);
                
                // If the controller returned a status (e.g. 0 to 8)
                if (rawStatus !== null && rawStatus >= 0 && rawStatus <= 8) {
                    const statusStr = AIREOS_STATUS_MAP[rawStatus] || `State (${rawStatus})`;
                    
                    // Parallel pull for RSSI, SNR, and SSID
                    const rssiOid = [...baseOid, 25, ...macBytes];
                    const snrOid = [...baseOid, 26, ...macBytes];
                    const ssidOid = [...baseOid, 4, ...macBytes];

                    const [rssiRes, snrRes, ssidRes] = await Promise.all([
                        snmpGet(ctrl.ip, community, rssiOid, 1000),
                        snmpGet(ctrl.ip, community, snrOid, 1000),
                        snmpGet(ctrl.ip, community, ssidOid, 1000)
                    ]);

                    const rssiVal = rssiRes ? parseSnmpInteger(rssiRes.buffer) : null;
                    const snrVal = snrRes ? parseSnmpInteger(snrRes.buffer) : null;
                    const ssidVal = ssidRes ? parseSnmpString(ssidRes.buffer) : null;

                    return {
                        found: true,
                        wlcName: ctrl.name,
                        wlcIp: ctrl.ip,
                        mac,
                        status: statusStr,
                        statusRaw: rawStatus,
                        ssid: ssidVal || undefined,
                        rssi: rssiVal !== null ? rssiVal : undefined,
                        snr: snrVal !== null ? snrVal : undefined,
                        excluded: rawStatus === 8,
                        exclusionReason: rawStatus === 8 ? 'WLC 802.11 Blacklist/Exclusion Threshold Triggered' : undefined,
                        latencyMs: statusRes.rtt
                    };
                }
            }
        } catch (e) {
            // Try next controller
        }
    }

    return { found: false };
}
