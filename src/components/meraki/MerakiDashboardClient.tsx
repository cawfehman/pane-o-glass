"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    Cloud,
    Network,
    Wifi,
    Server,
    Shield,
    RefreshCw,
    Search,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Clock,
    Zap,
    Activity,
    ArrowUpRight,
    Copy,
    Check,
    Layers,
    Radio,
    HardDrive,
    SlidersHorizontal,
    Play,
    Square,
    ChevronRight,
    Lock,
    Cpu,
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import { ToolHelp } from "@/components/ToolHelp";
import type {
    MerakiFleetOverviewResponse,
    MerakiDeviceUnified,
    MerakiDhcpScanResponse,
    MerakiSwitchInspection,
    MerakiNetworkClient,
    MerakiWirelessFailureSummary,
} from "@/lib/meraki";

type ActiveTab = "overview" | "dhcp" | "switch" | "wireless";

export default function MerakiDashboardClient() {
    const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
    const [selectedOrgId, setSelectedOrgId] = useState<string>("ALL");

    // Overview State
    const [overview, setOverview] = useState<MerakiFleetOverviewResponse | null>(null);
    const [overviewLoading, setOverviewLoading] = useState<boolean>(true);
    const [overviewError, setOverviewError] = useState<string | null>(null);
    const [liveAgeSec, setLiveAgeSec] = useState<number>(0);

    // Overview Filters
    const [deviceSearch, setDeviceSearch] = useState<string>("");
    const [productFilter, setProductFilter] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [overviewLayout, setOverviewLayout] = useState<"grouped" | "flat">("grouped");
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        "cooper-autovpn-headend-cluster": true,
    });
    const [copiedText, setCopiedText] = useState<string | null>(null);

    // Quick MAC / IP Resolver
    const [quickLookupInput, setQuickLookupInput] = useState<string>("");
    const [quickLookupResult, setQuickLookupResult] = useState<MerakiDeviceUnified | null | undefined>(undefined);

    // DHCP Tab State
    const [dhcpData, setDhcpData] = useState<MerakiDhcpScanResponse | null>(null);
    const [dhcpLoading, setDhcpLoading] = useState<boolean>(false);
    const [dhcpError, setDhcpError] = useState<string | null>(null);
    const [dhcpSearch, setDhcpSearch] = useState<string>("");
    const [dhcpSeverityFilter, setDhcpSeverityFilter] = useState<string>("ALL");
    const [isAutoScanningDhcp, setIsAutoScanningDhcp] = useState<boolean>(false);
    const autoScanAbortRef = useRef<boolean>(false);

    // Switch Inspector Tab State
    const [selectedSwitchSerial, setSelectedSwitchSerial] = useState<string>("");
    const [switchDetails, setSwitchDetails] = useState<MerakiSwitchInspection | null>(null);
    const [switchLoading, setSwitchLoading] = useState<boolean>(false);
    const [switchError, setSwitchError] = useState<string | null>(null);
    const [portSearch, setPortSearch] = useState<string>("");
    const [portFilter, setPortFilter] = useState<string>("ALL"); // ALL, CONNECTED, NEIGHBORS, POE, TRUNK, ERRORS
    const [selectedPortId, setSelectedPortId] = useState<string | null>(null);

    // Wireless & Clients Tab State
    const [selectedNetworkId, setSelectedNetworkId] = useState<string>("AUTO");
    const [clientSearch, setClientSearch] = useState<string>("");
    const [clientTimespan, setClientTimespan] = useState<number>(86400);
    const [wirelessLoading, setWirelessLoading] = useState<boolean>(false);
    const [wirelessError, setWirelessError] = useState<string | null>(null);
    const [clientsData, setClientsData] = useState<{
        clients: MerakiNetworkClient[];
        wirelessFailures: MerakiWirelessFailureSummary | null;
        ssids: { number: number; name: string; enabled: boolean; authMode?: string; encryptionMode?: string }[];
        inspectedNetworks: { id: string; name: string; organizationName: string }[];
    } | null>(null);
    const [connectionFilter, setConnectionFilter] = useState<string>("ALL"); // ALL, Wireless, Wired

    const copyToClipboard = (val: string) => {
        navigator.clipboard.writeText(val);
        setCopiedText(val);
        setTimeout(() => setCopiedText(null), 1800);
    };

    // Fetch Fleet Overview
    const fetchOverview = useCallback(
        async (forceRefresh = false) => {
            setOverviewLoading(true);
            setOverviewError(null);
            try {
                const params = new URLSearchParams({
                    orgId: selectedOrgId,
                    ...(forceRefresh ? { refresh: "true" } : {}),
                });
                const res = await fetch(`/api/meraki/overview?${params.toString()}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to load Meraki overview");
                setOverview(data);
                setLiveAgeSec(data.cacheMeta?.ageSeconds ?? 0);

                // Pre-select first online switch if none selected
                if (!selectedSwitchSerial && data.devices) {
                    const firstSwitch = data.devices.find(
                        (d: MerakiDeviceUnified) => d.productType === "switch" && d.status === "online"
                    ) || data.devices.find((d: MerakiDeviceUnified) => d.productType === "switch");
                    if (firstSwitch) {
                        setSelectedSwitchSerial(firstSwitch.serial);
                    }
                }
            } catch (err: any) {
                setOverviewError(err.message || "Error fetching Meraki overview");
            } finally {
                setOverviewLoading(false);
            }
        },
        [selectedOrgId, selectedSwitchSerial]
    );

    useEffect(() => {
        fetchOverview(false);
    }, [fetchOverview]);

    // Live-ticking age indicator & automatic sync with the 10-minute server background poller
    useEffect(() => {
        if (!overview?.fetchedAt) return;
        const updateAge = () => {
            const diffSec = Math.max(0, Math.round((Date.now() - new Date(overview.fetchedAt).getTime()) / 1000));
            setLiveAgeSec(diffSec);
            // If the 10-minute background poll interval has elapsed, sync the latest pre-warmed server snapshot (no forceRefresh needed)
            if (diffSec >= 605 && !overviewLoading) {
                fetchOverview(false);
            }
        };
        updateAge();
        const interval = setInterval(updateAge, 5000);
        return () => clearInterval(interval);
    }, [overview?.fetchedAt, overviewLoading, fetchOverview]);

    const formatAgeLabel = (sec: number) => {
        if (sec < 10) return "just now";
        if (sec < 60) return `${sec}s ago`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return s > 0 ? `${m}m ${s}s ago` : `${m}m ago`;
    };

    // Fetch DHCP Pools
    const fetchDhcpPools = useCallback(
        async (options?: { batchSize?: number; forceRefresh?: boolean; serial?: string }) => {
            setDhcpLoading(true);
            setDhcpError(null);
            try {
                const params = new URLSearchParams({
                    orgId: selectedOrgId,
                    search: dhcpSearch,
                    batchSize: String(options?.batchSize ?? 30),
                    ...(options?.serial ? { serial: options.serial } : {}),
                    ...(options?.forceRefresh ? { refresh: "true" } : {}),
                });
                const res = await fetch(`/api/meraki/dhcp?${params.toString()}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to load Meraki DHCP pools");
                setDhcpData(data);
                return data as MerakiDhcpScanResponse;
            } catch (err: any) {
                setDhcpError(err.message || "Error scanning Meraki DHCP subnets");
                return null;
            } finally {
                setDhcpLoading(false);
            }
        },
        [selectedOrgId, dhcpSearch]
    );

    // Auto-load DHCP when switching to DHCP tab
    useEffect(() => {
        if (activeTab === "dhcp" && !dhcpData && !dhcpLoading) {
            fetchDhcpPools({ batchSize: 30 });
        }
    }, [activeTab, dhcpData, dhcpLoading, fetchDhcpPools]);

    // Progressive Auto-Scan All Remaining MXs
    const startAutoScanAllDhcp = async () => {
        if (isAutoScanningDhcp) {
            autoScanAbortRef.current = true;
            setIsAutoScanningDhcp(false);
            return;
        }
        autoScanAbortRef.current = false;
        setIsAutoScanningDhcp(true);

        try {
            let safetyLoops = 0;
            while (!autoScanAbortRef.current && safetyLoops < 20) {
                safetyLoops++;
                const latest = await fetchDhcpPools({ batchSize: 35 });
                if (!latest || latest.coverage.remainingUnscannedAppliances <= 0) {
                    break;
                }
            }
        } finally {
            setIsAutoScanningDhcp(false);
        }
    };

    // Fetch Switch Details
    const fetchSwitchDetails = useCallback(
        async (serialToFetch: string, forceRefresh = false) => {
            if (!serialToFetch) return;
            setSwitchLoading(true);
            setSwitchError(null);
            try {
                const url = `/api/meraki/switch/${encodeURIComponent(serialToFetch)}${
                    forceRefresh ? "?refresh=true" : ""
                }`;
                const res = await fetch(url);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to fetch switch details");
                setSwitchDetails(data);
            } catch (err: any) {
                setSwitchError(err.message || "Error loading switch details");
            } finally {
                setSwitchLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        if (activeTab === "switch" && selectedSwitchSerial) {
            fetchSwitchDetails(selectedSwitchSerial, false);
        }
    }, [activeTab, selectedSwitchSerial, fetchSwitchDetails]);

    // Fetch Wireless & Clients
    const fetchWirelessAndClients = useCallback(
        async (forceRefresh = false) => {
            setWirelessLoading(true);
            setWirelessError(null);
            try {
                const params = new URLSearchParams({
                    orgId: selectedOrgId,
                    networkId: selectedNetworkId,
                    search: clientSearch,
                    timespan: String(clientTimespan),
                    ...(forceRefresh ? { refresh: "true" } : {}),
                });
                const res = await fetch(`/api/meraki/wireless?${params.toString()}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to fetch wireless & client data");
                setClientsData(data);
            } catch (err: any) {
                setWirelessError(err.message || "Error loading wireless & client telemetry");
            } finally {
                setWirelessLoading(false);
            }
        },
        [selectedOrgId, selectedNetworkId, clientSearch, clientTimespan]
    );

    useEffect(() => {
        if (activeTab === "wireless" && !clientsData && !wirelessLoading) {
            fetchWirelessAndClients(false);
        }
    }, [activeTab, clientsData, wirelessLoading, fetchWirelessAndClients]);

    // Quick Resolver Handler
    const handleQuickResolve = () => {
        const q = quickLookupInput.trim().toLowerCase();
        if (!q || !overview) {
            setQuickLookupResult(undefined);
            return;
        }
        const compactHex = q.replace(/[^0-9a-f]/g, "");
        const match = overview.devices.find(
            (d) =>
                d.serial.toLowerCase() === q ||
                (d.lanIp && d.lanIp.toLowerCase() === q) ||
                d.name.toLowerCase() === q ||
                d.mac.toLowerCase() === q ||
                (compactHex.length === 12 && d.macCompact === compactHex)
        );
        setQuickLookupResult(match || null);
    };

    // Filtered Fleet Devices
    const filteredDevices = useMemo(() => {
        if (!overview?.devices) return [];
        const q = deviceSearch.trim().toLowerCase();
        const qHex = q.replace(/[^0-9a-f]/g, "");

        return overview.devices.filter((d) => {
            if (productFilter !== "ALL" && d.productType !== productFilter) return false;
            if (statusFilter !== "ALL" && d.status !== statusFilter) return false;

            if (q) {
                const matchName = d.name.toLowerCase().includes(q);
                const matchNet = d.networkName.toLowerCase().includes(q);
                const matchSerial = d.serial.toLowerCase().includes(q);
                const matchModel = d.model.toLowerCase().includes(q);
                const matchLanIp = d.lanIp ? d.lanIp.toLowerCase().includes(q) : false;
                const matchPubIp = d.publicIp ? d.publicIp.toLowerCase().includes(q) : false;
                const matchMac = d.mac.toLowerCase().includes(q) || (qHex.length >= 4 && d.macCompact.includes(qHex));
                const matchUplink = d.uplinks.some(
                    (u) =>
                        (u.ip && u.ip.toLowerCase().includes(q)) ||
                        (u.publicIp && u.publicIp.toLowerCase().includes(q)) ||
                        (u.provider && u.provider.toLowerCase().includes(q))
                );
                if (!matchName && !matchNet && !matchSerial && !matchModel && !matchLanIp && !matchPubIp && !matchMac && !matchUplink) {
                    return false;
                }
            }
            return true;
        });
    }, [overview, deviceSearch, productFilter, statusFilter]);

    // All Switches for Switch Selector
    const availableSwitches = useMemo(() => {
        if (!overview?.devices) return [];
        return overview.devices
            .filter((d) => d.productType === "switch")
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [overview]);

    // Filtered Switch Ports
    const filteredSwitchPorts = useMemo(() => {
        if (!switchDetails?.ports) return [];
        const q = portSearch.trim().toLowerCase();
        return switchDetails.ports.filter((p) => {
            if (selectedPortId && p.portId !== selectedPortId) return false;
            if (portFilter === "CONNECTED" && p.status.toLowerCase() !== "connected") return false;
            if (portFilter === "NEIGHBORS" && !p.cdp && !p.lldp) return false;
            if (portFilter === "POE" && !p.poeAllocated) return false;
            if (portFilter === "TRUNK" && p.type.toLowerCase() !== "trunk") return false;
            if (portFilter === "ERRORS" && p.errors.length === 0 && p.warnings.length === 0) return false;

            if (q) {
                const mPort = p.portId.toLowerCase().includes(q);
                const mName = p.name.toLowerCase().includes(q);
                const mVlan = p.vlan ? String(p.vlan).includes(q) : false;
                const mCdp =
                    (p.cdp?.deviceId && p.cdp.deviceId.toLowerCase().includes(q)) ||
                    (p.cdp?.address && p.cdp.address.toLowerCase().includes(q)) ||
                    (p.cdp?.platform && p.cdp.platform.toLowerCase().includes(q));
                const mLldp =
                    (p.lldp?.systemName && p.lldp.systemName.toLowerCase().includes(q)) ||
                    (p.lldp?.managementAddress && p.lldp.managementAddress.toLowerCase().includes(q));
                if (!mPort && !mName && !mVlan && !mCdp && !mLldp) return false;
            }
            return true;
        });
    }, [switchDetails, portSearch, portFilter, selectedPortId]);

    // Filtered DHCP Pools
    const filteredDhcpPools = useMemo(() => {
        if (!dhcpData?.pools) return [];
        const q = dhcpSearch.trim().toLowerCase();
        return dhcpData.pools.filter((p) => {
            if (dhcpSeverityFilter !== "ALL" && p.severity !== dhcpSeverityFilter) return false;
            if (q) {
                const mNet = p.networkName.toLowerCase().includes(q);
                const mDev = p.deviceName.toLowerCase().includes(q);
                const mSub = p.subnet.toLowerCase().includes(q);
                const mSer = p.serial.toLowerCase().includes(q);
                const mVlan = String(p.vlanId).includes(q);
                if (!mNet && !mDev && !mSub && !mSer && !mVlan) return false;
            }
            return true;
        });
    }, [dhcpData, dhcpSearch, dhcpSeverityFilter]);

    // Filtered Clients
    const filteredClients = useMemo(() => {
        if (!clientsData?.clients) return [];
        return clientsData.clients.filter((c) => {
            if (connectionFilter !== "ALL" && c.recentDeviceConnection !== connectionFilter) return false;
            return true;
        });
    }, [clientsData, connectionFilter]);

    const getStatusBadge = (status: string) => {
        const s = status.toLowerCase();
        if (s === "online" || s === "active" || s === "connected") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {status.toUpperCase()}
                </span>
            );
        }
        if (s === "alerting" || s === "ready") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    {status.toUpperCase()}
                </span>
            );
        }
        if (s === "offline" || s === "failed") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    {status.toUpperCase()}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {status.toUpperCase()}
            </span>
        );
    };

    return (
        <div className="internal-scroll-layout">
            {/* Top Header */}
            <div className="shrink-0 flex flex-col gap-4 pb-3 border-b border-border-color">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <QueryHeader
                            title="Cisco Meraki Cloud Infrastructure"
                            description="Multi-organization MS switchport & CDP/LLDP inspector, MX WAN & DHCP pool exhaustion monitor, and MR wireless client telemetry."
                            icon={<Cloud size={32} className="text-emerald-400" />}
                        />
                        <ToolHelp toolId="meraki" iconSize={20} />
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Read-Only Assurance Pill */}
                        <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            title="Strict GET-only enforcement active in src/lib/meraki.ts. All configuration and action endpoints (/reboot, /cycle, /blinkLeds) are blocked."
                        >
                            <Lock size={13} />
                            Strict Read-Only API (GET Only)
                        </span>

                        {/* Organization Selector */}
                        <div className="flex items-center bg-bg-surface border border-border-color rounded-lg p-1 gap-1">
                            {[
                                { id: "ALL", label: "All Orgs (Cooper + CRMC)" },
                                { id: "905261", label: "Cooper Health" },
                                { id: "262100", label: "Cape Regional (CRMC)" },
                            ].map((org) => (
                                <button
                                    key={org.id}
                                    onClick={() => {
                                        setSelectedOrgId(org.id);
                                        setDhcpData(null);
                                        setClientsData(null);
                                    }}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer border-none ${
                                        selectedOrgId === org.id
                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                                            : "bg-transparent text-text-secondary hover:text-text-primary"
                                    }`}
                                >
                                    {org.label}
                                </button>
                            ))}
                        </div>

                        {/* Shared Cache Freshness Status Pill */}
                        {overview && (
                            <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                                    overview.cacheMeta?.status === "LIVE" && liveAgeSec < 25
                                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                        : liveAgeSec < 500
                                        ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                                        : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                }`}
                                title={`Server background poller refreshes Meraki every 10 minutes across all users. Last fetched at ${new Date(
                                    overview.fetchedAt
                                ).toLocaleTimeString()}.`}
                            >
                                <Clock size={13} />
                                {overview.cacheMeta?.status === "LIVE" && liveAgeSec < 20
                                    ? `Live Pull • ${formatAgeLabel(liveAgeSec)}`
                                    : `10m Auto-Poll • ${formatAgeLabel(liveAgeSec)}`}
                                <span className="opacity-70 text-[10px]">
                                    ({new Date(overview.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
                                </span>
                            </span>
                        )}

                        <button
                            onClick={() => {
                                fetchOverview(true);
                                if (activeTab === "dhcp") fetchDhcpPools({ batchSize: 30, forceRefresh: true });
                                if (activeTab === "switch" && selectedSwitchSerial)
                                    fetchSwitchDetails(selectedSwitchSerial, true);
                                if (activeTab === "wireless") fetchWirelessAndClients(true);
                            }}
                            disabled={overviewLoading}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-bg-surface border border-border-color text-text-primary hover:border-emerald-400/50 flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                            <RefreshCw size={14} className={overviewLoading ? "animate-spin text-emerald-400" : ""} />
                            Refresh Live
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs + Quick MAC/IP Resolver Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        {[
                            {
                                id: "overview" as ActiveTab,
                                label: "Fleet & WAN Uplinks",
                                icon: <Server size={15} />,
                                badge: overview?.summary.totalDevices,
                            },
                            {
                                id: "dhcp" as ActiveTab,
                                label: "DHCP Pool Exhaustion",
                                icon: <HardDrive size={15} />,
                                badge:
                                    dhcpData && dhcpData.summary.criticalPools + dhcpData.summary.warningPools > 0
                                        ? `${dhcpData.summary.criticalPools + dhcpData.summary.warningPools} Alerts`
                                        : undefined,
                                alert: dhcpData && dhcpData.summary.criticalPools > 0,
                            },
                            {
                                id: "switch" as ActiveTab,
                                label: "MS Switch & CDP Inspector",
                                icon: <Network size={15} />,
                                badge: overview?.summary.byProductType.switch,
                            },
                            {
                                id: "wireless" as ActiveTab,
                                label: "Wireless (MR) & Client Finder",
                                icon: <Wifi size={15} />,
                                badge: overview?.summary.byProductType.wireless,
                            },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                                    activeTab === tab.id
                                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm"
                                        : "bg-bg-surface text-text-secondary border-border-color hover:text-text-primary hover:border-white/20"
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                                {tab.badge !== undefined && (
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                            tab.alert
                                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                : "bg-black/30 text-text-muted"
                                        }`}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Instant Crawler MAC / IP / Serial Lookup */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                            <Search size={14} className="absolute left-3 text-text-muted" />
                            <input
                                type="text"
                                value={quickLookupInput}
                                onChange={(e) => {
                                    setQuickLookupInput(e.target.value);
                                    if (!e.target.value.trim()) setQuickLookupResult(undefined);
                                }}
                                onKeyDown={(e) => e.key === "Enter" && handleQuickResolve()}
                                placeholder="Quick resolve MAC (e.g. 683a1eaf84be) or IP..."
                                className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-surface border border-border-color text-xs text-text-primary w-64 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <button
                            onClick={handleQuickResolve}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer"
                        >
                            Resolve
                        </button>
                    </div>
                </div>

                {/* Quick Lookup Result Banner */}
                {quickLookupResult !== undefined && (
                    <div className="p-3 rounded-xl bg-bg-surface border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                        {quickLookupResult ? (
                            <>
                                <div className="flex items-center gap-3 flex-wrap">
                                    {getStatusBadge(quickLookupResult.status)}
                                    <span className="font-bold text-text-primary text-sm">
                                        {quickLookupResult.name}
                                    </span>
                                    <span className="font-mono px-2 py-0.5 rounded bg-black/30 text-emerald-300 border border-emerald-500/20">
                                        {quickLookupResult.model} ({quickLookupResult.productType})
                                    </span>
                                    <span className="text-text-secondary">
                                        Network: <strong className="text-text-primary">{quickLookupResult.networkName}</strong> ({quickLookupResult.organizationName})
                                    </span>
                                    <span className="font-mono text-text-secondary">
                                        LAN IP: <strong className="text-cyan-300">{quickLookupResult.lanIp || "N/A"}</strong>
                                    </span>
                                    <span className="font-mono text-text-secondary">
                                        MAC: <strong className="text-amber-300">{quickLookupResult.mac}</strong> ({quickLookupResult.macCompact})
                                    </span>
                                    <span className="font-mono text-text-muted">
                                        Serial: {quickLookupResult.serial}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {quickLookupResult.productType === "switch" && (
                                        <button
                                            onClick={() => {
                                                setSelectedSwitchSerial(quickLookupResult.serial);
                                                setActiveTab("switch");
                                            }}
                                            className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold cursor-pointer"
                                        >
                                            Inspect Switchports & CDP →
                                        </button>
                                    )}
                                    {quickLookupResult.productType === "appliance" && (
                                        <button
                                            onClick={() => {
                                                setActiveTab("dhcp");
                                                fetchDhcpPools({ serial: quickLookupResult.serial, batchSize: 5 });
                                            }}
                                            className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold cursor-pointer"
                                        >
                                            Inspect DHCP Pools →
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setQuickLookupResult(undefined)}
                                        className="text-text-muted hover:text-text-primary px-2 py-1 cursor-pointer bg-transparent border-none"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-between w-full">
                                <span className="text-rose-400 font-medium">
                                    No Meraki device matched &ldquo;{quickLookupInput}&rdquo; across Cooper Health or Cape Regional.
                                </span>
                                <button
                                    onClick={() => setQuickLookupResult(undefined)}
                                    className="text-text-muted hover:text-text-primary px-2 py-1 cursor-pointer bg-transparent border-none"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Scrollable Main Content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pt-4 pb-8">
                {overviewError && (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm mb-4 flex items-center gap-3">
                        <AlertTriangle size={18} />
                        <span>{overviewError}</span>
                    </div>
                )}

                {/* ===================================================================
                    TAB 1: FLEET & WAN UPLINKS OVERVIEW
                   =================================================================== */}
                {activeTab === "overview" && (
                    <div className="flex flex-col gap-5">
                        {/* Organization Comparison Cards */}
                        {overview && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {overview.organizations.map((org) => (
                                    <div
                                        key={org.id}
                                        className="glass-card p-5 border border-border-color flex flex-col gap-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="m-0 text-base font-bold text-text-primary">
                                                        {org.name}
                                                    </h3>
                                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
                                                        Org {org.id}
                                                    </span>
                                                </div>
                                                <p className="m-0 text-xs text-text-secondary mt-0.5">
                                                    {org.networkCount} Cloud Networks • {org.deviceCount} Managed Devices
                                                </p>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    setSelectedOrgId(selectedOrgId === org.id ? "ALL" : org.id)
                                                }
                                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer"
                                            >
                                                {selectedOrgId === org.id ? "Showing Only This Org" : "Filter Org"}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-border-color text-center">
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    MS Switches
                                                </div>
                                                <div className="text-base font-extrabold text-cyan-400 mt-0.5">
                                                    {org.switches}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    MX Appliances
                                                </div>
                                                <div className="text-base font-extrabold text-indigo-400 mt-0.5">
                                                    {org.appliances}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    MR Wireless
                                                </div>
                                                <div className="text-base font-extrabold text-purple-400 mt-0.5">
                                                    {org.wireless}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    Online
                                                </div>
                                                <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                                                    {org.online}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    Alerting
                                                </div>
                                                <div className="text-base font-extrabold text-amber-400 mt-0.5">
                                                    {org.alerting}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-bg-default border border-border-color">
                                                <div className="text-[10px] uppercase text-text-muted font-bold">
                                                    Offline / Dormant
                                                </div>
                                                <div className="text-base font-extrabold text-rose-400 mt-0.5">
                                                    {org.offline} / {org.dormant}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Filter Bar */}
                        <div className="glass-card p-4 border border-border-color flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Product Type Pills */}
                                {[
                                    { id: "ALL", label: "All Hardware" },
                                    { id: "switch", label: `MS Switches (${overview?.summary.byProductType.switch ?? 0})` },
                                    { id: "appliance", label: `MX Security/SD-WAN (${overview?.summary.byProductType.appliance ?? 0})` },
                                    { id: "wireless", label: `MR Wireless APs (${overview?.summary.byProductType.wireless ?? 0})` },
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setProductFilter(p.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-all ${
                                            productFilter === p.id
                                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                : "bg-bg-default text-text-secondary border-border-color hover:text-text-primary"
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}

                                <span className="text-border-color mx-1">|</span>

                                {/* Status Pills */}
                                {[
                                    { id: "ALL", label: "All Statuses" },
                                    { id: "alerting", label: `Alerting (${overview?.summary.byStatus.alerting ?? 0})` },
                                    { id: "offline", label: `Offline (${overview?.summary.byStatus.offline ?? 0})` },
                                    { id: "online", label: `Online (${overview?.summary.byStatus.online ?? 0})` },
                                    { id: "dormant", label: `Dormant (${overview?.summary.byStatus.dormant ?? 0})` },
                                ].map((st) => (
                                    <button
                                        key={st.id}
                                        onClick={() => setStatusFilter(st.id)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-all ${
                                            statusFilter === st.id
                                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                : "bg-bg-default text-text-secondary border-border-color hover:text-text-primary"
                                        }`}
                                    >
                                        {st.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-bg-default border border-border-color rounded-lg p-0.5">
                                    <button
                                        onClick={() => setOverviewLayout("grouped")}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer border-none ${
                                            overviewLayout === "grouped"
                                                ? "bg-emerald-500/20 text-emerald-300"
                                                : "bg-transparent text-text-secondary hover:text-text-primary"
                                        }`}
                                        title="Cooper Health grouped as AutoVPN cluster; Cape Regional separated by Site & IDF"
                                    >
                                        Grouped (AutoVPN / Site IDFs)
                                    </button>
                                    <button
                                        onClick={() => setOverviewLayout("flat")}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer border-none ${
                                            overviewLayout === "flat"
                                                ? "bg-emerald-500/20 text-emerald-300"
                                                : "bg-transparent text-text-secondary hover:text-text-primary"
                                        }`}
                                    >
                                        Flat Table
                                    </button>
                                </div>

                                <div className="relative flex items-center min-w-[260px]">
                                    <Search size={14} className="absolute left-3 text-text-muted" />
                                    <input
                                        type="text"
                                        value={deviceSearch}
                                        onChange={(e) => setDeviceSearch(e.target.value)}
                                        placeholder="Filter by name, IDF, IP, MAC, serial..."
                                        className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-default border border-border-color text-xs text-text-primary w-full focus:outline-none focus:border-cyan-400"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* GROUPED TOPOLOGY VIEW:
                            - Cooper Health: Single unified AutoVPN group anchored by the Wilmington DMZ MX250 Headend
                            - Cape Regional (CRMC): Separated into individual IDF Stacks & Standalone Sites */}
                        {overviewLayout === "grouped" && overview && (
                            <div className="flex flex-col gap-6">
                                {/* 1. Cooper Health Unified AutoVPN Cluster */}
                                {overview.topologyGroups
                                    .filter((g) => g.groupMode === "COOPER_AUTOVPN_CLUSTER")
                                    .map((group) => {
                                        const filteredGroupDevs = group.devices.filter((d) =>
                                            filteredDevices.some((fd) => fd.serial === d.serial)
                                        );
                                        if (filteredGroupDevs.length === 0) return null;
                                        const isExpanded = expandedGroups[group.groupId] ?? true;

                                        return (
                                            <div
                                                key={group.groupId}
                                                className="glass-card border border-indigo-500/40 overflow-hidden"
                                            >
                                                <div
                                                    onClick={() =>
                                                        setExpandedGroups((prev) => ({
                                                            ...prev,
                                                            [group.groupId]: !isExpanded,
                                                        }))
                                                    }
                                                    className="p-4 bg-indigo-500/10 border-b border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                                            <Shield size={20} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h3 className="m-0 text-sm font-extrabold text-text-primary">
                                                                    {group.groupTitle}
                                                                </h3>
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                                                    Unified AutoVPN Spoke Group
                                                                </span>
                                                            </div>
                                                            <p className="m-0 text-xs text-text-secondary mt-0.5">
                                                                {group.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs font-mono">
                                                        <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                                                            {group.counts.online} Online
                                                        </span>
                                                        {group.counts.alerting > 0 && (
                                                            <span className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                                                                {group.counts.alerting} Alerting
                                                            </span>
                                                        )}
                                                        <span className="px-2.5 py-1 rounded bg-white/5 text-text-secondary border border-white/10">
                                                            {filteredGroupDevs.length} / {group.counts.total} Endpoints
                                                        </span>
                                                        <span className="text-text-muted font-bold ml-1">
                                                            {isExpanded ? "▼" : "▶"}
                                                        </span>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="p-4 flex flex-col gap-4">
                                                        {/* Pinned Wilmington DMZ MX250 Headend Banner */}
                                                        {group.headendDevices.length > 0 && (
                                                            <div className="p-3.5 rounded-xl bg-bg-default border border-amber-500/30 flex flex-col gap-2">
                                                                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                                                                    <Server size={14} />
                                                                    Wilmington Firewall DMZ — MX250 VPN Concentrator Headend Pair
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    {group.headendDevices.map((hd) => (
                                                                        <div
                                                                            key={hd.serial}
                                                                            className="p-3 rounded-lg bg-bg-surface border border-border-color flex items-center justify-between gap-2 text-xs"
                                                                        >
                                                                            <div>
                                                                                <div className="font-bold text-text-primary flex items-center gap-2">
                                                                                    <span>{hd.name}</span>
                                                                                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                                                                        {hd.model}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="font-mono text-[11px] text-text-muted mt-0.5">
                                                                                    Serial: {hd.serial} • MAC: {hd.mac}
                                                                                    {hd.publicIp ? ` • WAN Pub: ${hd.publicIp}` : ""}
                                                                                </div>
                                                                            </div>
                                                                            {getStatusBadge(hd.status)}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Grouped Remote AutoVPN Endpoints Table */}
                                                        <div className="border border-border-color rounded-xl overflow-hidden">
                                                            <div className="px-3.5 py-2 bg-black/25 border-b border-border-color flex items-center justify-between text-xs">
                                                                <span className="font-bold text-text-secondary uppercase text-[11px]">
                                                                    Cooper Remote Access &amp; Clinic AutoVPN Spokes ({filteredGroupDevs.length})
                                                                </span>
                                                                <span className="text-[11px] text-text-muted">
                                                                    Showing top 100 matching endpoints (use search bar to filter specific clinic/user)
                                                                </span>
                                                            </div>
                                                            <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
                                                                <table className="w-full text-left border-collapse text-xs">
                                                                    <thead className="sticky top-0 bg-[#141418] z-10 border-b border-border-color text-text-muted uppercase text-[10px]">
                                                                        <tr>
                                                                            <th className="py-2.5 px-3">Status</th>
                                                                            <th className="py-2.5 px-3">Endpoint / Clinic Name</th>
                                                                            <th className="py-2.5 px-3">Role / Subgroup</th>
                                                                            <th className="py-2.5 px-3">Model &amp; Serial</th>
                                                                            <th className="py-2.5 px-3">LAN IP &amp; MAC</th>
                                                                            <th className="py-2.5 px-3">WAN Uplinks</th>
                                                                            <th className="py-2.5 px-3 text-right">Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-border-color">
                                                                        {filteredGroupDevs.slice(0, 100).map((dev) => (
                                                                            <tr key={dev.serial} className="hover:bg-white/[0.03]">
                                                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                                                    {getStatusBadge(dev.status)}
                                                                                </td>
                                                                                <td className="py-2.5 px-3 font-bold text-text-primary">
                                                                                    {dev.name}
                                                                                </td>
                                                                                <td className="py-2.5 px-3 text-[11px] text-text-secondary">
                                                                                    {dev.grouping.idfOrSubgroup}
                                                                                </td>
                                                                                <td className="py-2.5 px-3 font-mono">
                                                                                    <span className="text-indigo-300 font-bold">{dev.model}</span>{" "}
                                                                                    <span className="text-text-muted text-[11px]">({dev.serial})</span>
                                                                                </td>
                                                                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                                                                    <span className="text-cyan-300">{dev.lanIp || "—"}</span>
                                                                                    <span className="text-text-muted ml-2">{dev.mac}</span>
                                                                                </td>
                                                                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                                                                    {dev.uplinks
                                                                                        .filter((u) => u.status !== "not connected")
                                                                                        .map((u) => `${u.interface.toUpperCase()}: ${u.status}${u.ip ? ` (${u.ip})` : ""}`)
                                                                                        .join(" • ") || (dev.publicIp ? `Pub: ${dev.publicIp}` : "—")}
                                                                                </td>
                                                                                <td className="py-2.5 px-3 text-right">
                                                                                    {dev.productType === "switch" ? (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setSelectedSwitchSerial(dev.serial);
                                                                                                setActiveTab("switch");
                                                                                            }}
                                                                                            className="px-2 py-1 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] cursor-pointer"
                                                                                        >
                                                                                            Ports &amp; CDP
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setActiveTab("dhcp");
                                                                                                fetchDhcpPools({ serial: dev.serial, batchSize: 5 });
                                                                                            }}
                                                                                            className="px-2 py-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold text-[11px] cursor-pointer"
                                                                                        >
                                                                                            Check DHCP
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                {/* 2. Cape Regional (CRMC) Individual Site & IDF Cards (Un-grouped per IDF/Site) */}
                                {overview.topologyGroups.some((g) => g.groupMode === "CRMC_SITE_IDF") && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between px-1">
                                            <div>
                                                <h3 className="m-0 text-sm font-extrabold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                                                    <Network size={16} />
                                                    Cape Regional (CRMC) — Individual Campus IDFs &amp; Standalone Sites
                                                </h3>
                                                <p className="m-0 text-xs text-text-secondary mt-0.5">
                                                    Switches and wireless APs are separated by their physical IDF stack or standalone site rather than grouped together.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            {overview.topologyGroups
                                                .filter((g) => g.groupMode === "CRMC_SITE_IDF")
                                                .map((group) => {
                                                    const groupDevs = group.devices.filter((d) =>
                                                        filteredDevices.some((fd) => fd.serial === d.serial)
                                                    );
                                                    if (groupDevs.length === 0) return null;

                                                    return (
                                                        <div
                                                            key={group.groupId}
                                                            className="glass-card p-4 border border-border-color flex flex-col gap-3"
                                                        >
                                                            <div className="flex items-start justify-between gap-2 border-b border-border-color pb-2.5">
                                                                <div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <h4 className="m-0 text-sm font-bold text-text-primary">
                                                                            {group.groupTitle}
                                                                        </h4>
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                                                            {group.idfOrSubgroup}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[11px] text-text-muted mt-0.5">
                                                                        {group.siteName}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
                                                                    {group.counts.switches > 0 && (
                                                                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                                                            {group.counts.switches} MS
                                                                        </span>
                                                                    )}
                                                                    {group.counts.wireless > 0 && (
                                                                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                                                            {group.counts.wireless} MR
                                                                        </span>
                                                                    )}
                                                                    {group.counts.appliances > 0 && (
                                                                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                                            {group.counts.appliances} MX
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="max-h-[260px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1">
                                                                {groupDevs.map((dev) => (
                                                                    <div
                                                                        key={dev.serial}
                                                                        className="p-2.5 rounded-lg bg-bg-default border border-border-color flex items-center justify-between gap-2 text-xs hover:border-white/20"
                                                                    >
                                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                                            {getStatusBadge(dev.status)}
                                                                            <div className="min-w-0">
                                                                                <div className="font-bold text-text-primary truncate">
                                                                                    {dev.name}
                                                                                </div>
                                                                                <div className="font-mono text-[11px] text-text-muted truncate">
                                                                                    {dev.model} • {dev.lanIp || "No LAN IP"} • MAC: {dev.mac} ({dev.macCompact})
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="shrink-0">
                                                                            {dev.productType === "switch" && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setSelectedSwitchSerial(dev.serial);
                                                                                        setActiveTab("switch");
                                                                                    }}
                                                                                    className="px-2.5 py-1 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 font-bold text-[11px] cursor-pointer"
                                                                                >
                                                                                    Ports &amp; CDP
                                                                                </button>
                                                                            )}
                                                                            {dev.productType === "appliance" && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setActiveTab("dhcp");
                                                                                        fetchDhcpPools({ serial: dev.serial, batchSize: 5 });
                                                                                    }}
                                                                                    className="px-2.5 py-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 font-bold text-[11px] cursor-pointer"
                                                                                >
                                                                                    DHCP
                                                                                </button>
                                                                            )}
                                                                            {dev.productType === "wireless" && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setSelectedNetworkId(dev.networkId);
                                                                                        setActiveTab("wireless");
                                                                                        setClientsData(null);
                                                                                    }}
                                                                                    className="px-2.5 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 font-bold text-[11px] cursor-pointer"
                                                                                >
                                                                                    Clients
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* FLAT DEVICE INVENTORY TABLE (when toggled to Flat Table) */}
                        {overviewLayout === "flat" && (
                        <div className="glass-card border border-border-color overflow-hidden">
                            <div className="px-4 py-3 border-b border-border-color flex items-center justify-between">
                                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                                    Showing {filteredDevices.length} of {overview?.devices.length ?? 0} Meraki Devices
                                </span>
                                {overview?.fetchedAt && (
                                    <span className="text-[11px] text-text-muted font-mono">
                                        Snapshot: {new Date(overview.fetchedAt).toLocaleTimeString()}
                                    </span>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-border-color bg-black/20 text-text-muted uppercase text-[11px]">
                                            <th className="py-3 px-4">Status</th>
                                            <th className="py-3 px-4">Device Name & Serial</th>
                                            <th className="py-3 px-4">Organization & Network</th>
                                            <th className="py-3 px-4">Model / Type</th>
                                            <th className="py-3 px-4">LAN IP & MAC (Crawler ID)</th>
                                            <th className="py-3 px-4">WAN Uplinks / Public IP</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {overviewLoading && !overview ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-text-secondary">
                                                    <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-emerald-400" />
                                                    Loading multi-organization Meraki inventory...
                                                </td>
                                            </tr>
                                        ) : filteredDevices.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-10 text-center text-text-muted">
                                                    No Meraki devices match the current filters.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredDevices.slice(0, 250).map((dev) => (
                                                <tr
                                                    key={dev.serial}
                                                    className="hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        {getStatusBadge(dev.status)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-bold text-text-primary text-sm">
                                                            {dev.name}
                                                        </div>
                                                        <div className="font-mono text-[11px] text-text-muted flex items-center gap-1.5 mt-0.5">
                                                            <span>{dev.serial}</span>
                                                            {dev.firmware && (
                                                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-text-secondary">
                                                                    {dev.firmware}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-semibold text-text-primary">
                                                            {dev.networkName}
                                                        </div>
                                                        <div className="text-[11px] text-text-muted">
                                                            {dev.organizationName}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-bold border ${
                                                                dev.productType === "switch"
                                                                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                                                    : dev.productType === "appliance"
                                                                    ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                                                    : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                                                            }`}
                                                        >
                                                            {dev.model}
                                                        </span>
                                                        <div className="text-[10px] uppercase text-text-muted mt-0.5">
                                                            {dev.productType}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono">
                                                        <div className="text-cyan-300 font-semibold">
                                                            {dev.lanIp || "—"}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary mt-0.5">
                                                            <span>{dev.mac}</span>
                                                            <button
                                                                onClick={() => copyToClipboard(dev.macCompact)}
                                                                title={`Copy compact MAC (${dev.macCompact})`}
                                                                className="p-0.5 rounded bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-primary border-none cursor-pointer"
                                                            >
                                                                {copiedText === dev.macCompact ? (
                                                                    <Check size={11} className="text-emerald-400" />
                                                                ) : (
                                                                    <Copy size={11} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {dev.uplinks && dev.uplinks.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {dev.uplinks
                                                                    .filter((u) => u.status !== "not connected")
                                                                    .map((u, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className={`px-2 py-1 rounded border text-[11px] font-mono ${
                                                                                u.status === "active"
                                                                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                                                                    : u.status === "ready"
                                                                                    ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
                                                                                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                                                            }`}
                                                                        >
                                                                            <span className="font-bold uppercase">
                                                                                {u.interface}:
                                                                            </span>{" "}
                                                                            {u.status}{" "}
                                                                            {u.ip ? `(${u.ip})` : ""}
                                                                            {u.publicIp ? ` • Pub: ${u.publicIp}` : ""}
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        ) : dev.publicIp ? (
                                                            <span className="font-mono text-text-secondary">
                                                                Pub: {dev.publicIp}
                                                            </span>
                                                        ) : (
                                                            <span className="text-text-muted">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                                        {dev.productType === "switch" && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedSwitchSerial(dev.serial);
                                                                    setActiveTab("switch");
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 font-bold text-xs cursor-pointer"
                                                            >
                                                                Inspect Ports & CDP
                                                            </button>
                                                        )}
                                                        {dev.productType === "appliance" && (
                                                            <button
                                                                onClick={() => {
                                                                    setActiveTab("dhcp");
                                                                    fetchDhcpPools({ serial: dev.serial, batchSize: 5 });
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 font-bold text-xs cursor-pointer"
                                                            >
                                                                Check DHCP
                                                            </button>
                                                        )}
                                                        {dev.productType === "wireless" && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedNetworkId(dev.networkId);
                                                                    setActiveTab("wireless");
                                                                    setClientsData(null);
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 font-bold text-xs cursor-pointer"
                                                            >
                                                                Clients & RF
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        )}
                    </div>
                )}

                {/* ===================================================================
                    TAB 2: DHCP POOL EXHAUSTION & SUBNETS
                   =================================================================== */}
                {activeTab === "dhcp" && (
                    <div className="flex flex-col gap-5">
                        {/* Summary KPI Row */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="glass-card p-4 border border-border-color">
                                <div className="text-xs text-text-muted uppercase font-bold">
                                    Scanned Subnets
                                </div>
                                <div className="text-2xl font-extrabold text-text-primary mt-1">
                                    {dhcpData?.summary.totalSubnets ?? 0}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-1">
                                    {dhcpData?.coverage.cachedAppliances ?? 0} /{" "}
                                    {dhcpData?.coverage.totalOnlineAppliances ?? 0} Online MXs Cached
                                </div>
                            </div>

                            <div className="glass-card p-4 border border-rose-500/30 bg-rose-500/5">
                                <div className="text-xs text-rose-300 uppercase font-bold">
                                    Critical Exhaustion (≥90%)
                                </div>
                                <div className="text-2xl font-extrabold text-rose-400 mt-1">
                                    {dhcpData?.summary.criticalPools ?? 0}
                                </div>
                                <div className="text-[11px] text-rose-300/80 mt-1">
                                    Immediate lease starvation risk
                                </div>
                            </div>

                            <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/5">
                                <div className="text-xs text-amber-300 uppercase font-bold">
                                    Warning Pools (75–89%)
                                </div>
                                <div className="text-2xl font-extrabold text-amber-400 mt-1">
                                    {dhcpData?.summary.warningPools ?? 0}
                                </div>
                                <div className="text-[11px] text-amber-300/80 mt-1">
                                    Elevated clinic / branch usage
                                </div>
                            </div>

                            <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/5">
                                <div className="text-xs text-emerald-300 uppercase font-bold">
                                    Healthy Pools (&lt;75%)
                                </div>
                                <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                                    {dhcpData?.summary.healthyPools ?? 0}
                                </div>
                                <div className="text-[11px] text-emerald-300/80 mt-1">
                                    Ample free IP leases
                                </div>
                            </div>

                            <div className="glass-card p-4 border border-border-color">
                                <div className="text-xs text-text-muted uppercase font-bold">
                                    Peak Utilization
                                </div>
                                <div className="text-2xl font-extrabold text-cyan-400 mt-1">
                                    {dhcpData?.summary.highestUtilizationPct ?? 0}%
                                </div>
                                <div className="text-[11px] text-text-secondary mt-1">
                                    Across scanned MX VLANs
                                </div>
                            </div>
                        </div>

                        {/* Progressive Scanner Control & Search Bar */}
                        <div className="glass-card p-4 border border-border-color flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {[
                                        { id: "ALL", label: "All Subnets" },
                                        { id: "CRITICAL", label: `Critical ≥90% (${dhcpData?.summary.criticalPools ?? 0})` },
                                        { id: "WARNING", label: `Warning ≥75% (${dhcpData?.summary.warningPools ?? 0})` },
                                        { id: "HEALTHY", label: `Healthy (${dhcpData?.summary.healthyPools ?? 0})` },
                                    ].map((sev) => (
                                        <button
                                            key={sev.id}
                                            onClick={() => setDhcpSeverityFilter(sev.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-all ${
                                                dhcpSeverityFilter === sev.id
                                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                    : "bg-bg-default text-text-secondary border-border-color hover:text-text-primary"
                                            }`}
                                        >
                                            {sev.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="relative flex items-center min-w-[260px]">
                                        <Search size={14} className="absolute left-3 text-text-muted" />
                                        <input
                                            type="text"
                                            value={dhcpSearch}
                                            onChange={(e) => setDhcpSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && fetchDhcpPools({ batchSize: 35 })}
                                            placeholder="Filter clinic/network, subnet CIDR, VLAN..."
                                            className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-default border border-border-color text-xs text-text-primary w-full focus:outline-none focus:border-emerald-400"
                                        />
                                    </div>

                                    <button
                                        onClick={() => fetchDhcpPools({ batchSize: 35 })}
                                        disabled={dhcpLoading}
                                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer flex items-center gap-1.5"
                                    >
                                        <RefreshCw size={13} className={dhcpLoading ? "animate-spin" : ""} />
                                        Scan Next 35 MXs
                                    </button>

                                    {(dhcpData?.coverage.remainingUnscannedAppliances ?? 0) > 0 && (
                                        <button
                                            onClick={startAutoScanAllDhcp}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 border ${
                                                isAutoScanningDhcp
                                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                                            }`}
                                        >
                                            {isAutoScanningDhcp ? (
                                                <>
                                                    <Square size={13} />
                                                    Stop Auto-Scan ({dhcpData?.coverage.remainingUnscannedAppliances} left)
                                                </>
                                            ) : (
                                                <>
                                                    <Play size={13} />
                                                    Auto-Scan Remaining ({dhcpData?.coverage.remainingUnscannedAppliances} MXs)
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Coverage Progress Bar */}
                            {dhcpData && dhcpData.coverage.totalOnlineAppliances > 0 && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[11px] text-text-secondary">
                                        <span>
                                            Rate-Limited MX DHCP Pool Discovery Coverage:{" "}
                                            <strong className="text-text-primary">
                                                {dhcpData.coverage.cachedAppliances} of{" "}
                                                {dhcpData.coverage.totalOnlineAppliances}
                                            </strong>{" "}
                                            online MX appliances cached (10-min TTL)
                                        </span>
                                        <span className="font-mono">
                                            {Math.round(
                                                (dhcpData.coverage.cachedAppliances /
                                                    dhcpData.coverage.totalOnlineAppliances) *
                                                    100
                                            )}
                                            %
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-400 transition-all duration-300"
                                            style={{
                                                width: `${Math.min(
                                                    100,
                                                    Math.round(
                                                        (dhcpData.coverage.cachedAppliances /
                                                            dhcpData.coverage.totalOnlineAppliances) *
                                                            100
                                                    )
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {dhcpError && (
                            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                                {dhcpError}
                            </div>
                        )}

                        {/* DHCP Pools Table */}
                        <div className="glass-card border border-border-color overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-border-color bg-black/20 text-text-muted uppercase text-[11px]">
                                            <th className="py-3 px-4">Severity</th>
                                            <th className="py-3 px-4">Network / Clinic & MX Appliance</th>
                                            <th className="py-3 px-4">VLAN & Subnet CIDR</th>
                                            <th className="py-3 px-4">DHCP Pool Utilization</th>
                                            <th className="py-3 px-4">Used Leases</th>
                                            <th className="py-3 px-4">Free Leases</th>
                                            <th className="py-3 px-4">Total Pool Size</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {dhcpLoading && !dhcpData ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-text-secondary">
                                                    <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-emerald-400" />
                                                    Interrogating live MX DHCP subnet pools...
                                                </td>
                                            </tr>
                                        ) : filteredDhcpPools.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-10 text-center text-text-muted">
                                                    No DHCP pools match the current filter. Click &ldquo;Scan Next 35 MXs&rdquo; to expand coverage.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredDhcpPools.map((pool, i) => (
                                                <tr
                                                    key={`${pool.serial}-${pool.vlanId}-${pool.subnet}-${i}`}
                                                    className="hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                                                pool.severity === "CRITICAL"
                                                                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                                                    : pool.severity === "WARNING"
                                                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                                                    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                            }`}
                                                        >
                                                            {pool.severity}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-bold text-text-primary text-sm">
                                                            {pool.networkName}
                                                        </div>
                                                        <div className="text-[11px] text-text-muted font-mono">
                                                            {pool.deviceName} ({pool.model} • {pool.serial}) •{" "}
                                                            {pool.organizationName}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono">
                                                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold">
                                                            VLAN {pool.vlanId}
                                                        </span>
                                                        <div className="text-text-primary font-semibold mt-1">
                                                            {pool.subnet}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 min-w-[220px]">
                                                        <div className="flex items-center justify-between text-xs font-mono mb-1">
                                                            <span
                                                                className={`font-bold ${
                                                                    pool.severity === "CRITICAL"
                                                                        ? "text-rose-400"
                                                                        : pool.severity === "WARNING"
                                                                        ? "text-amber-300"
                                                                        : "text-emerald-400"
                                                                }`}
                                                            >
                                                                {pool.utilizationPct}%
                                                            </span>
                                                            <span className="text-text-muted text-[11px]">
                                                                {pool.usedCount} / {pool.totalCount} IPs
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${
                                                                    pool.severity === "CRITICAL"
                                                                        ? "bg-rose-500"
                                                                        : pool.severity === "WARNING"
                                                                        ? "bg-amber-400"
                                                                        : "bg-emerald-400"
                                                                }`}
                                                                style={{
                                                                    width: `${Math.min(100, pool.utilizationPct)}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-text-primary">
                                                        {pool.usedCount}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                                                        {pool.freeCount}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-text-secondary">
                                                        {pool.totalCount}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===================================================================
                    TAB 3: MS SWITCH & PORT / CDP INSPECTOR
                   =================================================================== */}
                {activeTab === "switch" && (
                    <div className="flex flex-col gap-5">
                        {/* Switch Selector Bar */}
                        <div className="glass-card p-4 border border-border-color flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-wrap flex-1">
                                <label className="text-xs font-bold uppercase text-text-secondary">
                                    Select MS Switch ({availableSwitches.length}):
                                </label>
                                <select
                                    value={selectedSwitchSerial}
                                    onChange={(e) => {
                                        setSelectedSwitchSerial(e.target.value);
                                        setSelectedPortId(null);
                                    }}
                                    className="px-3 py-2 rounded-xl bg-bg-default border border-border-color text-xs font-bold text-text-primary min-w-[340px] focus:outline-none focus:border-cyan-400"
                                >
                                    {availableSwitches.map((sw) => (
                                        <option key={sw.serial} value={sw.serial}>
                                            [{sw.status.toUpperCase()}] {sw.name} — {sw.model} ({sw.lanIp || "No IP"} •{" "}
                                            {sw.networkName})
                                        </option>
                                    ))}
                                </select>

                                <button
                                    onClick={() => fetchSwitchDetails(selectedSwitchSerial, true)}
                                    disabled={switchLoading || !selectedSwitchSerial}
                                    className="px-3 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer flex items-center gap-1.5"
                                >
                                    <RefreshCw size={13} className={switchLoading ? "animate-spin" : ""} />
                                    Poll Switch Live
                                </button>
                            </div>

                            {switchDetails?.device && (
                                <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
                                    <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-text-secondary">
                                        Serial: <strong className="text-text-primary">{switchDetails.serial}</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-text-secondary">
                                        LAN IP:{" "}
                                        <strong className="text-cyan-300">
                                            {switchDetails.device.lanIp || "N/A"}
                                        </strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-text-secondary">
                                        MAC:{" "}
                                        <strong className="text-amber-300">{switchDetails.device.mac}</strong> (
                                        {switchDetails.device.macCompact})
                                    </span>
                                </div>
                            )}
                        </div>

                        {switchError && (
                            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                                {switchError}
                            </div>
                        )}

                        {switchDetails && (
                            <>
                                {/* Visual Switch Faceplate Matrix */}
                                <div className="glass-card p-5 border border-border-color flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="m-0 text-sm font-bold text-text-primary">
                                                Live Port Matrix — {switchDetails.device?.name || switchDetails.serial}
                                            </h3>
                                            <span className="text-xs text-text-muted">
                                                ({switchDetails.summary.connectedPorts} /{" "}
                                                {switchDetails.summary.totalPorts} Connected •{" "}
                                                {switchDetails.summary.poeActivePorts} PoE Drawing •{" "}
                                                {switchDetails.summary.neighborCount} CDP/LLDP Neighbors)
                                            </span>
                                        </div>
                                        {selectedPortId && (
                                            <button
                                                onClick={() => setSelectedPortId(null)}
                                                className="px-2.5 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer"
                                            >
                                                Clear Port #{selectedPortId} Filter ✕
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-6 sm:grid-cols-12 md:grid-cols-14 lg:grid-cols-24 gap-1.5 pt-2">
                                        {switchDetails.ports.map((p) => {
                                            const isConn = p.status.toLowerCase() === "connected";
                                            const hasNb = Boolean(p.cdp || p.lldp);
                                            const isSel = selectedPortId === p.portId;
                                            return (
                                                <button
                                                    key={p.portId}
                                                    onClick={() =>
                                                        setSelectedPortId(isSel ? null : p.portId)
                                                    }
                                                    title={`Port ${p.portId}: ${p.name} | ${p.status} | ${p.type.toUpperCase()} VLAN ${
                                                        p.vlan ?? "Trunk"
                                                    }${
                                                        p.cdp?.deviceId || p.lldp?.systemName
                                                            ? ` | Neighbor: ${p.cdp?.deviceId || p.lldp?.systemName}`
                                                            : ""
                                                    }`}
                                                    className={`p-1.5 rounded-lg border text-center font-mono text-[11px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all ${
                                                        isSel
                                                            ? "ring-2 ring-amber-400 scale-105"
                                                            : ""
                                                    } ${
                                                        !p.enabled
                                                            ? "bg-rose-950/30 border-rose-500/30 text-rose-400/70"
                                                            : isConn
                                                            ? hasNb
                                                                ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                                                                : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                                            : "bg-bg-default border-border-color text-text-muted"
                                                    }`}
                                                >
                                                    <span className="font-bold">{p.portId}</span>
                                                    <div className="flex items-center gap-0.5 text-[9px]">
                                                        {p.poeAllocated && <Zap size={9} className="text-amber-400" />}
                                                        {p.type === "trunk" && (
                                                            <span className="text-purple-300 font-bold">T</span>
                                                        )}
                                                        {hasNb && (
                                                            <span className="text-cyan-300 font-bold">N</span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* L3 Routed SVIs (if present) */}
                                {switchDetails.routedInterfaces.length > 0 && (
                                    <div className="glass-card p-4 border border-border-color">
                                        <h4 className="m-0 text-xs font-bold uppercase text-cyan-400 mb-2">
                                            Layer 3 Routed Interfaces / SVIs ({switchDetails.routedInterfaces.length})
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                                            {switchDetails.routedInterfaces.map((svi) => (
                                                <div
                                                    key={svi.interfaceId}
                                                    className="p-2.5 rounded-lg bg-bg-default border border-border-color text-xs font-mono"
                                                >
                                                    <div className="font-bold text-text-primary">
                                                        VLAN {svi.vlanId} — {svi.name}
                                                    </div>
                                                    <div className="text-cyan-300 mt-0.5">
                                                        IP: {svi.interfaceIp} ({svi.subnet})
                                                    </div>
                                                    {svi.defaultGateway && (
                                                        <div className="text-text-muted text-[11px]">
                                                            GW: {svi.defaultGateway}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Port Filter Bar */}
                                <div className="glass-card p-3.5 border border-border-color flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {[
                                            { id: "ALL", label: `All Ports (${switchDetails.summary.totalPorts})` },
                                            {
                                                id: "CONNECTED",
                                                label: `Connected (${switchDetails.summary.connectedPorts})`,
                                            },
                                            {
                                                id: "NEIGHBORS",
                                                label: `CDP / LLDP Neighbors (${switchDetails.summary.neighborCount})`,
                                            },
                                            {
                                                id: "POE",
                                                label: `PoE Active (${switchDetails.summary.poeActivePorts})`,
                                            },
                                            {
                                                id: "TRUNK",
                                                label: `802.1Q Trunks (${switchDetails.summary.trunkPorts})`,
                                            },
                                            {
                                                id: "ERRORS",
                                                label: `Port Errors (${switchDetails.summary.errorPortCount})`,
                                            },
                                        ].map((pf) => (
                                            <button
                                                key={pf.id}
                                                onClick={() => setPortFilter(pf.id)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border transition-all ${
                                                    portFilter === pf.id
                                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                        : "bg-bg-default text-text-secondary border-border-color hover:text-text-primary"
                                                }`}
                                            >
                                                {pf.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative flex items-center min-w-[240px]">
                                        <Search size={14} className="absolute left-3 text-text-muted" />
                                        <input
                                            type="text"
                                            value={portSearch}
                                            onChange={(e) => setPortSearch(e.target.value)}
                                            placeholder="Filter port #, label, VLAN, CDP neighbor..."
                                            className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-default border border-border-color text-xs text-text-primary w-full focus:outline-none focus:border-cyan-400"
                                        />
                                    </div>
                                </div>

                                {/* Detailed Switchports Table */}
                                <div className="glass-card border border-border-color overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b border-border-color bg-black/20 text-text-muted uppercase text-[11px]">
                                                    <th className="py-3 px-4">Port</th>
                                                    <th className="py-3 px-4">Status & Speed</th>
                                                    <th className="py-3 px-4">Description / Label</th>
                                                    <th className="py-3 px-4">Mode & VLANs</th>
                                                    <th className="py-3 px-4">PoE / Traffic</th>
                                                    <th className="py-3 px-4">CDP / LLDP Neighbor</th>
                                                    <th className="py-3 px-4">Health / Warnings</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-color">
                                                {filteredSwitchPorts.map((port) => {
                                                    const nbName =
                                                        port.cdp?.deviceId ||
                                                        port.lldp?.systemName ||
                                                        port.cdp?.systemName ||
                                                        null;
                                                    const nbPort = port.cdp?.portId || port.lldp?.portId || null;
                                                    const nbIp =
                                                        port.cdp?.address ||
                                                        port.cdp?.managementAddress ||
                                                        port.lldp?.managementAddress ||
                                                        null;
                                                    const nbPlatform =
                                                        port.cdp?.platform || port.lldp?.systemDescription || null;

                                                    return (
                                                        <tr
                                                            key={port.portId}
                                                            className="hover:bg-white/[0.03] transition-colors"
                                                        >
                                                            <td className="py-3 px-4 font-mono font-bold text-sm text-text-primary whitespace-nowrap">
                                                                #{port.portId}
                                                                {port.isUplink && (
                                                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                        UPLINK
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 whitespace-nowrap">
                                                                {getStatusBadge(
                                                                    !port.enabled ? "Disabled" : port.status
                                                                )}
                                                                {port.speed && (
                                                                    <div className="text-[11px] text-text-muted font-mono mt-1">
                                                                        {port.speed} • {port.duplex}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 font-medium text-text-primary">
                                                                {port.name}
                                                                {port.clientCount > 0 && (
                                                                    <div className="text-[11px] text-text-muted">
                                                                        {port.clientCount} connected client(s)
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 font-mono">
                                                                <span
                                                                    className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                                                        port.type === "trunk"
                                                                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                                                            : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                                                    }`}
                                                                >
                                                                    {port.type}
                                                                </span>
                                                                <div className="text-[11px] text-text-secondary mt-1">
                                                                    VLAN: <strong>{port.vlan ?? "—"}</strong>
                                                                    {port.voiceVlan
                                                                        ? ` • Voice: ${port.voiceVlan}`
                                                                        : ""}
                                                                    {port.type === "trunk"
                                                                        ? ` • Allowed: ${port.allowedVlans}`
                                                                        : ""}
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4 font-mono">
                                                                {port.poeAllocated ? (
                                                                    <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                                                                        <Zap size={12} />
                                                                        PoE Active{" "}
                                                                        {port.powerUsageInWh
                                                                            ? `(${port.powerUsageInWh} Wh)`
                                                                            : ""}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-text-muted">
                                                                        {port.poeEnabled ? "PoE Idle" : "PoE Off"}
                                                                    </span>
                                                                )}
                                                                {port.trafficInKbps && port.trafficInKbps.total > 0 && (
                                                                    <div className="text-[11px] text-emerald-400 mt-0.5">
                                                                        {port.trafficInKbps.total} Kbps
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                {nbName || nbIp ? (
                                                                    <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 font-mono text-[11px]">
                                                                        <div className="font-bold text-cyan-300">
                                                                            {nbName || nbIp}
                                                                        </div>
                                                                        <div className="text-text-secondary">
                                                                            {nbPort ? `Remote Port: ${nbPort}` : ""}
                                                                            {nbIp ? ` • IP: ${nbIp}` : ""}
                                                                        </div>
                                                                        {nbPlatform && (
                                                                            <div className="text-[10px] text-text-muted truncate max-w-[260px]">
                                                                                {nbPlatform}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-text-muted">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                {port.errors.length > 0 || port.warnings.length > 0 ? (
                                                                    <div className="flex flex-col gap-1">
                                                                        {port.errors.map((e, idx) => (
                                                                            <span
                                                                                key={idx}
                                                                                className="text-[11px] text-rose-400 font-medium"
                                                                            >
                                                                                • {e}
                                                                            </span>
                                                                        ))}
                                                                        {port.warnings.map((w, idx) => (
                                                                            <span
                                                                                key={idx}
                                                                                className="text-[11px] text-amber-300"
                                                                            >
                                                                                • {w}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-emerald-400/80 text-[11px]">
                                                                        Clean
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ===================================================================
                    TAB 4: WIRELESS (MR) & CLIENT FINDER
                   =================================================================== */}
                {activeTab === "wireless" && (
                    <div className="flex flex-col gap-5">
                        {/* Network & Client Search Controls */}
                        <div className="glass-card p-4 border border-border-color flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <label className="text-xs font-bold uppercase text-text-secondary">
                                    Network:
                                </label>
                                <select
                                    value={selectedNetworkId}
                                    onChange={(e) => {
                                        setSelectedNetworkId(e.target.value);
                                        setClientsData(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-bg-default border border-border-color text-xs font-bold text-text-primary max-w-[320px]"
                                >
                                    <option value="AUTO">
                                        Auto (Primary Wireless & Switch Networks)
                                    </option>
                                    {(overview?.networks || []).map((n) => (
                                        <option key={n.id} value={n.id}>
                                            {n.name} ({n.productTypes.join(", ")})
                                        </option>
                                    ))}
                                </select>

                                {/* Timespan Pills */}
                                {[
                                    { sec: 3600, label: "1h" },
                                    { sec: 21600, label: "6h" },
                                    { sec: 86400, label: "24h" },
                                    { sec: 604800, label: "7d" },
                                ].map((t) => (
                                    <button
                                        key={t.sec}
                                        onClick={() => {
                                            setClientTimespan(t.sec);
                                            setClientsData(null);
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer border ${
                                            clientTimespan === t.sec
                                                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                                : "bg-bg-default text-text-secondary border-border-color"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}

                                {/* Wired / Wireless Filter */}
                                {["ALL", "Wireless", "Wired"].map((conn) => (
                                    <button
                                        key={conn}
                                        onClick={() => setConnectionFilter(conn)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer border ${
                                            connectionFilter === conn
                                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                : "bg-bg-default text-text-secondary border-border-color"
                                        }`}
                                    >
                                        {conn}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center min-w-[260px]">
                                    <Search size={14} className="absolute left-3 text-text-muted" />
                                    <input
                                        type="text"
                                        value={clientSearch}
                                        onChange={(e) => setClientSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && fetchWirelessAndClients(false)}
                                        placeholder="Search client IP, MAC, hostname, user, SSID..."
                                        className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-default border border-border-color text-xs text-text-primary w-full focus:outline-none focus:border-purple-400"
                                    />
                                </div>
                                <button
                                    onClick={() => fetchWirelessAndClients(false)}
                                    disabled={wirelessLoading}
                                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 cursor-pointer flex items-center gap-1.5"
                                >
                                    <RefreshCw size={13} className={wirelessLoading ? "animate-spin" : ""} />
                                    Search
                                </button>
                            </div>
                        </div>

                        {/* Wireless 802.11 Connection Failure Breakdown */}
                        {clientsData?.wirelessFailures && (
                            <div className="glass-card p-5 border border-border-color flex flex-col gap-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h3 className="m-0 text-sm font-bold text-text-primary flex items-center gap-2">
                                            <Radio size={16} className="text-purple-400" />
                                            MR Wireless 802.11 Onboarding & Roaming Failure Breakdown
                                        </h3>
                                        <p className="m-0 text-xs text-text-secondary mt-0.5">
                                            Total Failed Wireless Connections in Window:{" "}
                                            <strong className="text-rose-400">
                                                {clientsData.wirelessFailures.totalFailures}
                                            </strong>
                                        </p>
                                    </div>
                                    {clientsData.ssids.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {clientsData.ssids.map((s) => (
                                                <span
                                                    key={s.number}
                                                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                                        s.enabled
                                                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                                            : "bg-white/5 text-text-muted border-white/10"
                                                    }`}
                                                >
                                                    SSID: {s.name} ({s.authMode})
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="p-3 rounded-xl bg-bg-default border border-border-color">
                                        <div className="text-[11px] text-text-muted uppercase font-bold">
                                            1. RF Association (assoc)
                                        </div>
                                        <div className="text-xl font-extrabold text-cyan-400 mt-1">
                                            {clientsData.wirelessFailures.byStage.assoc}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-bg-default border border-border-color">
                                        <div className="text-[11px] text-text-muted uppercase font-bold">
                                            2. 802.1X / PSK Auth (auth)
                                        </div>
                                        <div className="text-xl font-extrabold text-amber-400 mt-1">
                                            {clientsData.wirelessFailures.byStage.auth}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-bg-default border border-border-color">
                                        <div className="text-[11px] text-text-muted uppercase font-bold">
                                            3. IP Lease (dhcp)
                                        </div>
                                        <div className="text-xl font-extrabold text-rose-400 mt-1">
                                            {clientsData.wirelessFailures.byStage.dhcp}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-bg-default border border-border-color">
                                        <div className="text-[11px] text-text-muted uppercase font-bold">
                                            4. DNS Resolution (dns)
                                        </div>
                                        <div className="text-xl font-extrabold text-purple-400 mt-1">
                                            {clientsData.wirelessFailures.byStage.dns}
                                        </div>
                                    </div>
                                </div>

                                {clientsData.wirelessFailures.topFailingSerials.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-color text-xs">
                                        <span className="text-text-muted font-bold uppercase text-[11px]">
                                            Top Failing Access Points:
                                        </span>
                                        {clientsData.wirelessFailures.topFailingSerials.map((ap) => (
                                            <span
                                                key={ap.serial}
                                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[11px]"
                                            >
                                                {ap.deviceName} ({ap.count} fails)
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Clients Table */}
                        <div className="glass-card border border-border-color overflow-hidden">
                            <div className="px-4 py-3 border-b border-border-color flex items-center justify-between">
                                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                                    Connected & Recent Network Endpoints ({filteredClients.length})
                                </span>
                                {clientsData?.inspectedNetworks && (
                                    <span className="text-[11px] text-text-muted">
                                        Networks:{" "}
                                        {clientsData.inspectedNetworks.map((n) => n.name).join(", ")}
                                    </span>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-border-color bg-black/20 text-text-muted uppercase text-[11px]">
                                            <th className="py-3 px-4">Endpoint / User</th>
                                            <th className="py-3 px-4">IPv4 & MAC Address</th>
                                            <th className="py-3 px-4">Connection & SSID / Port</th>
                                            <th className="py-3 px-4">Connected Meraki Device</th>
                                            <th className="py-3 px-4">VLAN</th>
                                            <th className="py-3 px-4">OS / Manufacturer</th>
                                            <th className="py-3 px-4 text-right">Usage (KB)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {wirelessLoading && !clientsData ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-text-secondary">
                                                    <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-purple-400" />
                                                    Fetching Meraki client & wireless telemetry...
                                                </td>
                                            </tr>
                                        ) : filteredClients.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-10 text-center text-text-muted">
                                                    No clients matched your search criteria in the selected network(s).
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredClients.map((c) => (
                                                <tr
                                                    key={`${c.networkId}-${c.id}-${c.mac}`}
                                                    className="hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className="font-bold text-text-primary text-sm">
                                                            {c.description || c.user || c.mac}
                                                        </div>
                                                        {c.user && (
                                                            <div className="text-[11px] text-amber-300 font-mono">
                                                                User: {c.user}
                                                            </div>
                                                        )}
                                                        <div className="text-[10px] text-text-muted">
                                                            {c.networkName}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono">
                                                        <div className="text-cyan-300 font-semibold">
                                                            {c.ip || "—"}
                                                        </div>
                                                        <div className="text-[11px] text-text-secondary">
                                                            {c.mac}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span
                                                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                                                c.recentDeviceConnection === "Wireless"
                                                                    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                                                                    : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                                            }`}
                                                        >
                                                            {c.recentDeviceConnection}
                                                        </span>
                                                        <div className="text-[11px] text-text-secondary mt-1 font-mono">
                                                            {c.ssid
                                                                ? `SSID: ${c.ssid}`
                                                                : c.switchport
                                                                ? `Switchport #${c.switchport}`
                                                                : ""}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-semibold text-text-primary">
                                                            {c.recentDeviceName || c.recentDeviceSerial || "—"}
                                                        </div>
                                                        {c.recentDeviceSerial && (
                                                            <div className="font-mono text-[11px] text-text-muted">
                                                                {c.recentDeviceSerial}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono">
                                                        {c.vlan ?? "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="text-text-primary">
                                                            {c.os || "Unknown OS"}
                                                        </div>
                                                        <div className="text-[11px] text-text-muted">
                                                            {c.manufacturer || ""}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-mono">
                                                        <div className="font-bold text-emerald-400">
                                                            {c.usage.total.toLocaleString()} KB
                                                        </div>
                                                        <div className="text-[10px] text-text-muted">
                                                            ↑{c.usage.sent.toLocaleString()} / ↓
                                                            {c.usage.recv.toLocaleString()}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
