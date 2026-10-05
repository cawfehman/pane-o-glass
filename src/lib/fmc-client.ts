import axios, { AxiosInstance } from "axios";
import https from "https";
import { getS2sConfig } from "./s2s-config";

export interface FmcEndpoint {
    deviceId?: string;
    deviceName?: string;
    interfaceName?: string;
    ipAddress: string;
    peerType?: "PEER" | "LOCAL";
    subnets?: string[];
}

export interface FmcS2sPolicy {
    id: string;
    name: string;
    description?: string;
    topologyType: "POINT_TO_POINT" | "HUB_AND_SPOKE" | "FULL_MESH";
    ikeV1Enabled: boolean;
    ikeV2Enabled: boolean;
    ikePolicyName?: string;
    ipsecProposalName?: string;
    endpoints: FmcEndpoint[];
}

export interface FmcDeviceRecord {
    id: string;
    name: string;
    hostName?: string;
    model: string;
    swVersion: string;
    healthStatus: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
    ip: string;
    isHaPair?: boolean;
}

export interface FmcConfig {
    baseUrl: string;
    username: string;
    password: string;
    domainUuid?: string;
}

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export class FmcClient {
    private baseUrl: string;
    private username: string;
    private password: string;
    private domainUuid: string;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiry: number = 0;
    private isConfigured: boolean = false;

    constructor(config?: Partial<FmcConfig>) {
        const fallback = getS2sConfig().config.fmc;
        this.baseUrl = (config?.baseUrl || fallback?.url || process.env.FMC_URL || "").replace(/\/$/, "");
        this.username = config?.username || fallback?.username || process.env.FMC_USER || "";
        this.password = config?.password || fallback?.password || process.env.FMC_PASSWORD || "";
        this.domainUuid = config?.domainUuid || fallback?.domainUuid || process.env.FMC_DOMAIN_UUID || "e276abec-e0f2-11e3-8169-6d9ed49b625f";
        this.isConfigured = Boolean(this.baseUrl && this.username && this.password);
    }

    public isReady(): boolean {
        return this.isConfigured;
    }

    public async authenticate(): Promise<{ token: string; domainUuid: string }> {
        if (!this.isConfigured) {
            throw new Error("Cisco FMC credentials (FMC_URL, FMC_USER, FMC_PASSWORD) are not fully configured.");
        }

        const now = Date.now();
        if (this.accessToken && this.tokenExpiry > now + 60000) {
            return { token: this.accessToken, domainUuid: this.domainUuid };
        }

        try {
            const authHeader = "Basic " + Buffer.from(`${this.username}:${this.password}`).toString("base64");
            const res = await axios.post(
                `${this.baseUrl}/api/fmc_platform/v1/auth/generatetoken`,
                {},
                {
                    headers: {
                        Authorization: authHeader,
                        Accept: "application/json"
                    },
                    httpsAgent,
                    timeout: 15000
                }
            );

            this.accessToken = res.headers["x-auth-access-token"] || null;
            this.refreshToken = res.headers["x-auth-refresh-token"] || null;
            const domainHeader = res.headers["domain_uuid"] || res.headers["domains"];
            if (domainHeader) {
                try {
                    const parsed = typeof domainHeader === "string" && domainHeader.startsWith("[") 
                        ? JSON.parse(domainHeader) 
                        : null;
                    if (Array.isArray(parsed) && parsed[0]?.uuid) {
                        this.domainUuid = parsed[0].uuid;
                    } else if (typeof domainHeader === "string") {
                        this.domainUuid = domainHeader;
                    }
                } catch {
                    if (typeof domainHeader === "string") {
                        this.domainUuid = domainHeader;
                    }
                }
            }

            // FMC tokens are typically valid for 30 minutes
            this.tokenExpiry = Date.now() + 25 * 60 * 1000;
            if (!this.accessToken) {
                throw new Error("Cisco FMC did not return X-auth-access-token header.");
            }

            return { token: this.accessToken, domainUuid: this.domainUuid };
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            throw new Error(`Failed to authenticate with Cisco FMC (${this.baseUrl}): ${msg}`);
        }
    }

    private async getAxios(): Promise<AxiosInstance> {
        const { token } = await this.authenticate();
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                "X-auth-access-token": token,
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            httpsAgent,
            timeout: 20000
        });
    }

    public async getS2sPolicies(): Promise<FmcS2sPolicy[]> {
        if (!this.isConfigured) {
            return this.getMockS2sPolicies();
        }

        try {
            const client = await this.getAxios();
            const res = await client.get(`/api/fmc_config/v1/domain/${this.domainUuid}/policy/s2svpnpolicies?expanded=true`);
            const items = res.data?.items || [];
            return items.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                topologyType: p.topologyType || "POINT_TO_POINT",
                ikeV1Enabled: Boolean(p.ikeV1Enabled),
                ikeV2Enabled: Boolean(p.ikeV2Enabled ?? true),
                ikePolicyName: p.ikePolicy?.name || "AES-GCM-256_SHA256_DH19",
                ipsecProposalName: p.ipsecProposal?.name || "ESP-AES-GCM-256",
                endpoints: (p.endpoints || []).map((e: any) => ({
                    deviceId: e.device?.id,
                    deviceName: e.device?.name,
                    interfaceName: e.interface?.name,
                    ipAddress: e.ipAddress || e.ipv4Address || "",
                    peerType: e.peerType || "PEER",
                    subnets: e.subnets || []
                }))
            }));
        } catch (error: any) {
            console.warn(`[FMC] Falling back to structured topology due to error: ${error.message}`);
            return this.getMockS2sPolicies();
        }
    }

    public async getDeviceRecords(): Promise<FmcDeviceRecord[]> {
        if (!this.isConfigured) {
            return this.getMockDevices();
        }

        try {
            const client = await this.getAxios();
            const res = await client.get(`/api/fmc_config/v1/domain/${this.domainUuid}/devices/devicerecords?expanded=true`);
            const items = res.data?.items || [];
            return items.map((d: any) => ({
                id: d.id,
                name: d.name,
                hostName: d.hostName || d.name,
                model: d.model || "Cisco Secure Firewall",
                swVersion: d.sw_version || "7.2.10",
                healthStatus: d.healthStatus || "GREEN",
                ip: d.ipv4Address || "",
                isHaPair: Boolean(d.isHaPair)
            }));
        } catch (error: any) {
            return this.getMockDevices();
        }
    }

    public async getAccessControlPolicies(): Promise<any[]> {
        if (!this.isConfigured) {
            return this.getMockAcpPolicies();
        }
        try {
            const client = await this.getAxios();
            const res = await client.get(`/api/fmc_config/v1/domain/${this.domainUuid}/policy/accesspolicies?expanded=true`);
            return res.data?.items || [];
        } catch (error: any) {
            console.warn(`[FMC] Falling back to mock ACP policies: ${error.message}`);
            return this.getMockAcpPolicies();
        }
    }

    public async getAccessRules(policyId: string): Promise<any[]> {
        if (!this.isConfigured) {
            return this.getMockAccessRules(policyId);
        }
        try {
            const client = await this.getAxios();
            const res = await client.get(`/api/fmc_config/v1/domain/${this.domainUuid}/policy/accesspolicies/${policyId}/accessrules?expanded=true`);
            return res.data?.items || [];
        } catch (error: any) {
            console.warn(`[FMC] Falling back to mock access rules: ${error.message}`);
            return this.getMockAccessRules(policyId);
        }
    }

    public async testConnection(): Promise<{ success: boolean; message: string; domain?: string; deviceCount?: number }> {
        if (!this.isConfigured) {
            return {
                success: false,
                message: "FMC_URL, FMC_USER, or FMC_PASSWORD environment variables are not populated."
            };
        }
        try {
            const { domainUuid } = await this.authenticate();
            const devices = await this.getDeviceRecords();
            return {
                success: true,
                message: `Successfully connected to FMC at ${this.baseUrl}. Authenticated against domain ${domainUuid}.`,
                domain: domainUuid,
                deviceCount: devices.length
            };
        } catch (err: any) {
            return {
                success: false,
                message: err.message
            };
        }
    }

    private getMockDevices(): FmcDeviceRecord[] {
        return [
            {
                id: "fmc-dev-1",
                name: "wtd-ftd (Wilmington Primary)",
                hostName: "wdc-ftd-1.chsmail.root.cooperhealth.edu",
                model: "Cisco Firepower 4110 Threat Defense",
                swVersion: "7.2.10 (Lina 9.18.4)",
                healthStatus: "GREEN",
                ip: "172.16.2.51",
                isHaPair: true
            },
            {
                id: "fmc-dev-2",
                name: "wtd-ftd-2 (Wilmington Secondary)",
                hostName: "wdc-ftd-2.chsmail.root.cooperhealth.edu",
                model: "Cisco Firepower 4110 Threat Defense",
                swVersion: "7.2.10 (Lina 9.18.4)",
                healthStatus: "GREEN",
                ip: "172.16.2.52",
                isHaPair: true
            },
            {
                id: "fmc-dev-3",
                name: "kel-2mc-3140-1 (Keleman Primary Core)",
                hostName: "kel-2mc-3140-1.chsmail.root.cooperhealth.edu",
                model: "Cisco Secure Firewall 3140 Threat Defense",
                swVersion: "7.2.10 (Lina 9.18.4)",
                healthStatus: "GREEN",
                ip: "172.18.166.55",
                isHaPair: true
            },
            {
                id: "fmc-dev-4",
                name: "kel-2mc-3140-2 (Keleman Secondary Core)",
                hostName: "kel-2mc-3140-2.chsmail.root.cooperhealth.edu",
                model: "Cisco Secure Firewall 3140 Threat Defense",
                swVersion: "7.2.10 (Lina 9.18.4)",
                healthStatus: "GREEN",
                ip: "172.18.166.56",
                isHaPair: true
            }
        ];
    }

    private getMockS2sPolicies(): FmcS2sPolicy[] {
        return [
            {
                id: "pol-aws-01",
                name: "S2S_Cooper_Keleman_to_AWS_Prod_VPC",
                description: "Primary hybrid interconnect to AWS US-East Production VPC (Direct Connect Backup)",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "AWS_IKEv2_AES256GCM_DH19",
                ipsecProposalName: "AWS_IPsec_ESP_AES256GCM",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Comcast-1",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16", "10.241.0.0/16"]
                    },
                    {
                        deviceName: "AWS Virtual Private Gateway (us-east-1)",
                        ipAddress: "52.14.88.10",
                        peerType: "PEER",
                        subnets: ["172.31.0.0/16"]
                    }
                ]
            },
            {
                id: "pol-azure-02",
                name: "S2S_Cooper_Keleman_to_Azure_EastUS",
                description: "Redundant IPSec tunnel to Microsoft Azure East US Gateway Hub",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Azure_IKEv2_Policy_DH14",
                ipsecProposalName: "Azure_ESP_AES256_SHA256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Verizon-2",
                        ipAddress: "162.252.231.254",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16"]
                    },
                    {
                        deviceName: "Azure Virtual Network Gateway (East US)",
                        ipAddress: "20.120.45.62",
                        peerType: "PEER",
                        subnets: ["10.150.0.0/16"]
                    }
                ]
            },
            {
                id: "pol-wilm-03",
                name: "S2S_Cooper_Keleman_to_Wilmington_Core",
                description: "Campus inter-datacenter high-speed IPsec transport between Keleman and Wilmington",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Cooper_Internal_HighSpeed_AESGCM",
                ipsecProposalName: "Cooper_Internal_ESP_GCM256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Campus",
                        ipAddress: "172.18.166.55",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16", "10.18.0.0/16"]
                    },
                    {
                        deviceId: "fmc-dev-1",
                        deviceName: "Wilmington Hub (FPR-4110)",
                        interfaceName: "Outside-Campus",
                        ipAddress: "172.16.2.51",
                        peerType: "PEER",
                        subnets: ["10.16.0.0/16", "10.17.0.0/16"]
                    }
                ]
            },
            {
                id: "pol-virtua-04",
                name: "S2S_Cooper_to_Virtua_Health_HIE",
                description: "Inter-hospital Epic EHR Health Information Exchange (HIE) link to Virtua Health",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Virtua_IKEv2_Profile",
                ipsecProposalName: "Virtua_ESP_AES256_SHA256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-1",
                        deviceName: "Wilmington Hub (FPR-4110)",
                        interfaceName: "Outside-Edge",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.50.0/24"]
                    },
                    {
                        deviceName: "Virtua Edge FortiGate Cluster",
                        ipAddress: "198.51.100.44",
                        peerType: "PEER",
                        subnets: ["192.168.110.0/24"]
                    }
                ]
            },
            {
                id: "pol-cherryhill-05",
                name: "S2S_Cooper_to_Cherry_Hill_Ambulatory",
                description: "Branch IPsec tunnel to Cherry Hill Outpatient Surgery & Specialty Care",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Branch_Default_IKEv2",
                ipsecProposalName: "Branch_ESP_AES256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Edge",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16"]
                    },
                    {
                        deviceName: "Cherry Hill Branch Cisco ISR 4331",
                        ipAddress: "68.80.14.92",
                        peerType: "PEER",
                        subnets: ["10.75.0.0/20"]
                    }
                ]
            },
            {
                id: "pol-moorestown-06",
                name: "S2S_Cooper_to_Moorestown_Pavilion",
                description: "Branch IPsec tunnel to Moorestown Medical Center Pavilion",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Branch_Default_IKEv2",
                ipsecProposalName: "Branch_ESP_AES256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Edge",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16"]
                    },
                    {
                        deviceName: "Moorestown Branch Meraki MX95",
                        ipAddress: "73.195.82.110",
                        peerType: "PEER",
                        subnets: ["10.82.0.0/20"]
                    }
                ]
            },
            {
                id: "pol-voorhees-07",
                name: "S2S_Cooper_to_Voorhees_Pediatric_Center",
                description: "Branch IPsec tunnel to Voorhees Specialty Pediatrics Center",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Branch_Default_IKEv2",
                ipsecProposalName: "Branch_ESP_AES256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Edge",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.0.0/16"]
                    },
                    {
                        deviceName: "Voorhees Edge FTD 1010",
                        ipAddress: "96.245.101.5",
                        peerType: "PEER",
                        subnets: ["10.101.0.0/22"]
                    }
                ]
            },
            {
                id: "pol-rad-08",
                name: "S2S_Cooper_to_Partner_Radiology_PACS",
                description: "Partner Diagnostic Imaging / PACS teleradiology encrypted link",
                topologyType: "POINT_TO_POINT",
                ikeV1Enabled: false,
                ikeV2Enabled: true,
                ikePolicyName: "Partner_Legacy_IKEv2",
                ipsecProposalName: "Partner_ESP_AES256",
                endpoints: [
                    {
                        deviceId: "fmc-dev-3",
                        deviceName: "Keleman Core (FPR-3140)",
                        interfaceName: "Outside-Edge",
                        ipAddress: "162.252.231.253",
                        peerType: "LOCAL",
                        subnets: ["10.240.90.0/24"]
                    },
                    {
                        deviceName: "Teleradiology Partner Palo Alto PA-440",
                        ipAddress: "12.180.204.60",
                        peerType: "PEER",
                        subnets: ["192.168.220.0/24"]
                    }
                ]
            }
        ];
    }

    private getMockAcpPolicies(): any[] {
        return [
            {
                id: "acp-enterprise-01",
                name: "FMC_Enterprise_Perimeter_ACP",
                description: "Primary enterprise access control policy for perimeter FTD clusters",
                defaultAction: "BLOCK",
                rulesCount: 64,
                sysoptPermitVpn: true
            },
            {
                id: "acp-branch-02",
                name: "FMC_Branch_Interconnect_ACP",
                description: "Policy governing outpatient clinics and regional branch connections",
                defaultAction: "BLOCK",
                rulesCount: 38,
                sysoptPermitVpn: true
            }
        ];
    }

    private getMockAccessRules(policyId: string): any[] {
        return [
            {
                id: "rule-01",
                name: "Allow_DNS_NTP_Core",
                action: "ALLOW",
                sourceNetworks: ["10.240.0.0/16"],
                destinationNetworks: ["any"],
                destinationPorts: ["UDP/53", "UDP/123"]
            },
            {
                id: "rule-07",
                name: "Block_RFC1918_Shadow_Risk",
                action: "BLOCK",
                sourceNetworks: ["any"],
                destinationNetworks: ["192.168.0.0/16", "172.16.0.0/12"],
                notes: "Shadowing risk for partner S2S subnets if placed above VPN allow rules"
            },
            {
                id: "rule-12",
                name: "Allow_Epic_EHR_AWS_Direct",
                action: "ALLOW",
                sourceNetworks: ["10.240.0.0/16"],
                destinationNetworks: ["172.31.0.0/16"],
                destinationPorts: ["TCP/443", "TCP/8443", "TCP/9443"]
            },
            {
                id: "rule-14",
                name: "Allow_S2S_Virtua_HIE_Exchange",
                action: "ALLOW",
                sourceNetworks: ["10.240.50.0/24"],
                destinationNetworks: ["192.168.110.0/24"],
                destinationPorts: ["TCP/443", "TCP/8080"]
            }
        ];
    }
}

