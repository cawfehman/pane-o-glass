"use client";

import { useState, useEffect } from "react";
import { 
    Layers, ShieldAlert, Globe, Search, Clock, User, Server, 
    Activity, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, 
    X, Lock, Shield, ArrowUpRight, Filter, ChevronRight, Terminal, Laptop, Plus, Bug, Zap,
    AlertOctagon, UserX, Flame, Copy, Download, Check, Play, Pause, RotateCcw, FileText, Radio,
    DownloadCloud, Calendar
} from "lucide-react";
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, BarChart, Bar, Cell 
} from "recharts";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { 
    NetscalerStats, NetscalerForeignEvent, NetscalerTimelineEvent,
    NetscalerIocRule, NetscalerIocFinding, NetscalerMatchedIp, DEFAULT_CITRIX_IOC_RULES 
} from "@/lib/netscaler-graylog";

const COUNTRY_COLORS: Record<string, string> = {
    US: "#3b82f6",
    DE: "#6366f1",
    BR: "#10b981",
    CA: "#0ea5e9",
    AU: "#f59e0b",
    MX: "#ec4899",
    GB: "#8b5cf6",
    IN: "#14b8a6",
    RU: "#ef4444",
    CN: "#dc2626",
    FR: "#06b6d4"
};

export default function NetscalerDashboardClient() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [stats, setStats] = useState<NetscalerStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Timeframe (seconds): 3600=1h, 21600=6h, 43200=12h, 86400=24h, 259200=3d, 604800=7d
    const [timeframe, setTimeframe] = useState<number>(86400);

    // Active tab
    const [activeTab, setActiveTab] = useState<"overview" | "foreign" | "investigate" | "iocs" | "cve-shuns">("overview");

    // CVE-2026 Auto-Shun & Dedicated Tracking State
    const [cveShuns, setCveShuns] = useState<any[]>([]);
    const [cveStats, setCveStats] = useState<{
        totalTracked: number;
        activeCount: number;
        removedCount: number;
        cve88771Count: number;
        cve88772Count: number;
        lastCycleTime: string | null;
        lastCycleStatus: string;
        lastCycleMessage: string | null;
        autoShunEnabled: boolean;
    }>({
        totalTracked: 0,
        activeCount: 0,
        removedCount: 0,
        cve88771Count: 0,
        cve88772Count: 0,
        lastCycleTime: null,
        lastCycleStatus: "READY",
        lastCycleMessage: null,
        autoShunEnabled: false
    });
    const [cveLoading, setCveLoading] = useState(false);
    const [cveSearch, setCveSearch] = useState("");
    const [cveFilter, setCveFilter] = useState<"ALL" | "88771" | "88772">("ALL");
    const [cveStatusFilter, setCveStatusFilter] = useState<"ALL" | "ACTIVE" | "REMOVED">("ALL");
    const [cveActionLoading, setCveActionLoading] = useState<string | null>(null);
    const [cycleRunning, setCycleRunning] = useState(false);
    const [selectedPayloadSample, setSelectedPayloadSample] = useState<{ ip: string; payload: string; rule: string; cve: string } | null>(null);

    // Geo Access & Location Intel state
    const [geoScope, setGeoScope] = useState<"all" | "foreign" | "us">("all");
    const [geoBreakdownView, setGeoBreakdownView] = useState<"countries" | "us_cities" | "foreign">("countries");
    const [failureScope, setFailureScope] = useState<"foreign" | "us">("foreign");

    // Investigation state
    const [searchQuery, setSearchQuery] = useState("");
    const [investigateLoading, setInvestigateLoading] = useState(false);
    const [timeline, setTimeline] = useState<NetscalerTimelineEvent[]>([]);
    const [timelineFilter, setTimelineFilter] = useState<string>("ALL");
    const [investigateError, setInvestigateError] = useState<string | null>(null);

    // Foreign traffic table state
    const [foreignFilter, setForeignFilter] = useState("");

    // Zero-Day & IOC Threat Hunting State
    const [iocRules, setIocRules] = useState<NetscalerIocRule[]>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("pane_netscaler_custom_iocs");
            if (saved) {
                try {
                    const parsed: NetscalerIocRule[] = JSON.parse(saved);
                    const ruleMap = new Map<string, NetscalerIocRule>();
                    DEFAULT_CITRIX_IOC_RULES.forEach(r => ruleMap.set(r.id, r));
                    parsed.forEach(r => {
                        if (r.category === "CUSTOM") {
                            ruleMap.set(r.id, r);
                        } else if (!ruleMap.has(r.id)) {
                            ruleMap.set(r.id, r);
                        }
                    });
                    return Array.from(ruleMap.values());
                } catch (e) {}
            }
        }
        return DEFAULT_CITRIX_IOC_RULES;
    });
    const [iocFindings, setIocFindings] = useState<NetscalerIocFinding[]>([]);
    const [iocFilterCve, setIocFilterCve] = useState<string>("ALL");
    const [iocLoading, setIocLoading] = useState(false);
    const [iocError, setIocError] = useState<string | null>(null);
    const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
    const [newRuleName, setNewRuleName] = useState("");
    const [newRuleCve, setNewRuleCve] = useState("");
    const [newRuleDesc, setNewRuleDesc] = useState("");
    const [newRuleQuery, setNewRuleQuery] = useState("");
    const [newRuleSeverity, setNewRuleSeverity] = useState<"CRITICAL" | "HIGH" | "MEDIUM">("HIGH");

    // Matched Threat IPs state
    const [copiedIp, setCopiedIp] = useState<string | null>(null);
    const [expandedIpsRuleId, setExpandedIpsRuleId] = useState<string | null>(null);

    // Quick Perimeter Shun Modal State (Supports Single IP and Batch IPs)
    const [shunModalData, setShunModalData] = useState<{
        ip?: string;
        ips?: string[];
        ruleName?: string;
        country?: string;
        city?: string;
        targetHost: string;
        loading: boolean;
        result: any | null;
        error: string | null;
    } | null>(null);

    // Graylog Bulk Exporter Timeframe Override Modal State
    const [cveExportModal, setCveExportModal] = useState<{
        open: boolean;
        title: string;
        query: string;
        timeframeMode: "scan" | "24h" | "3d" | "7d" | "custom";
        customFrom: string;
        customTo: string;
    } | null>(null);

    const toLocalIso = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const openExportModal = ({
        title,
        query,
        defaultTimeframe = "24h"
    }: {
        title: string;
        query: string;
        defaultTimeframe?: "scan" | "24h" | "3d" | "7d" | "custom";
    }) => {
        const now = new Date();
        const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        setCveExportModal({
            open: true,
            title,
            query,
            timeframeMode: defaultTimeframe,
            customFrom: toLocalIso(past24h),
            customTo: toLocalIso(now)
        });
    };

    const launchBulkExport = () => {
        if (!cveExportModal) return;
        const params = new URLSearchParams();
        params.set("cluster", "OG_GRAYLOG");
        params.set("streamId", "5c055e3ab20902046cedcfcd");
        params.set("title", cveExportModal.title);
        params.set("query", cveExportModal.query.trim());
        params.set("fields", "timestamp,source,client_ip,username,vserver_ip,vserver_port,event_type,message");

        if (cveExportModal.timeframeMode === "scan") {
            const hours = Math.round(timeframe / 3600);
            if (hours === 24) params.set("timePreset", "24h");
            else if (hours === 72) params.set("timePreset", "3d");
            else if (hours === 168) params.set("timePreset", "7d");
            else if (hours === 1) params.set("timePreset", "1h");
            else if (hours === 6) params.set("timePreset", "6h");
            else {
                const now = new Date();
                const past = new Date(now.getTime() - timeframe * 1000);
                params.set("timePreset", "custom");
                params.set("from", toLocalIso(past));
                params.set("to", toLocalIso(now));
            }
        } else if (cveExportModal.timeframeMode === "custom") {
            params.set("timePreset", "custom");
            params.set("from", cveExportModal.customFrom);
            params.set("to", cveExportModal.customTo);
        } else {
            params.set("timePreset", cveExportModal.timeframeMode);
        }

        router.push(`/utilities/graylog-exporter?${params.toString()}`);
    };

    const [firewallHosts, setFirewallHosts] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        fetch("/api/firewall/hosts")
            .then(res => res.json())
            .then(data => {
                if (data.hosts) setFirewallHosts(data.hosts);
            })
            .catch(() => {});
    }, []);

    const isPrivateIpCheck = (ip?: string) => {
        if (!ip) return false;
        return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.)/.test(ip);
    };

    const copyToClipboard = (text: string, id: string = "all") => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedIp(id);
            setTimeout(() => setCopiedIp(null), 2500);
        }
    };

    const exportIpsCsv = (ipsList: NetscalerMatchedIp[], filename = "netscaler-threat-ips.csv") => {
        if (!ipsList || ipsList.length === 0) return;
        const headers = "IP,Hits,Country,City,First Seen,Last Seen\n";
        const rows = ipsList.map(m => `"${m.ip}",${m.count},"${m.countryCode || ''}","${m.cityName || ''}","${m.firstSeen || ''}","${m.lastSeen || ''}"`).join("\n");
        const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Fetch CVE Stats on initial mount
    useEffect(() => {
        fetch("/api/netscaler/cve-shuns?limit=1")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.stats) setCveStats(data.stats);
            })
            .catch(() => {});
    }, []);

    // Fetch CVE Shuns when activeTab is cve-shuns
    const fetchCveShuns = async () => {
        setCveLoading(true);
        try {
            const params = new URLSearchParams();
            if (cveSearch) params.set("search", cveSearch);
            if (cveFilter !== "ALL") params.set("cve", cveFilter);
            if (cveStatusFilter !== "ALL") params.set("status", cveStatusFilter);

            const res = await fetch(`/api/netscaler/cve-shuns?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setCveShuns(data.shuns || []);
                if (data.stats) setCveStats(data.stats);
            }
        } catch (e) {
            console.error("Failed to load CVE shuns:", e);
        } finally {
            setCveLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === "cve-shuns") {
            fetchCveShuns();
        }
    }, [activeTab, cveFilter, cveStatusFilter]);

    const triggerAutoShunCycle = async () => {
        setCycleRunning(true);
        try {
            const res = await fetch("/api/netscaler/cve-shuns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "run_cycle", range: timeframe })
            });
            const data = await res.json();
            if (data.success) {
                if (data.stats) setCveStats(data.stats);
                await fetchCveShuns();
            }
        } catch (e) {
            console.error("Failed to run auto-shun cycle:", e);
        } finally {
            setCycleRunning(false);
        }
    };

    const toggleAutoShunProtection = async () => {
        if (!cveStats) return;
        const target = !cveStats.autoShunEnabled;
        try {
            const res = await fetch("/api/netscaler/cve-shuns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle_auto_shun", enabled: target })
            });
            const data = await res.json();
            if (data.success && data.stats) {
                setCveStats(data.stats);
            }
        } catch (e) {
            console.error("Failed to toggle auto shun:", e);
        }
    };

    const handleUnshunIp = async (ip: string) => {
        if (!confirm(`Are you sure you want to remove the perimeter firewall shun for ${ip}? This will re-allow traffic from this IP.`)) return;
        setCveActionLoading(ip);
        try {
            const res = await fetch("/api/netscaler/cve-shuns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "unshun", ip })
            });
            const data = await res.json();
            if (data.success) {
                await fetchCveShuns();
            } else {
                alert(data.error || "Failed to remove shun");
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setCveActionLoading(null);
        }
    };

    const handleReshunIp = async (ip: string) => {
        setCveActionLoading(ip);
        try {
            const res = await fetch("/api/netscaler/cve-shuns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reshun", ip })
            });
            const data = await res.json();
            if (data.success) {
                await fetchCveShuns();
            } else {
                alert(data.error || "Failed to re-apply shun");
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setCveActionLoading(null);
        }
    };

    const exportCveShunsCsv = () => {
        if (cveShuns.length === 0) return;
        const headers = "IP,Status,CVE,Signature,Hits,Origin Country,City,Shunned At,Last Seen,Removed At,Sample Exploit\n";
        const rows = cveShuns.map(s => [
            `"${s.ip}"`,
            `"${s.status}"`,
            `"${s.cve}"`,
            `"${(s.ruleName || '').replace(/"/g, '""')}"`,
            s.matchCount,
            `"${s.countryCode || ''}"`,
            `"${s.cityName || ''}"`,
            `"${s.shunnedAt}"`,
            `"${s.lastSeenAt}"`,
            `"${s.removedAt || ''}"`,
            `"${(s.samplePayload || '').slice(0, 200).replace(/"/g, '""')}"`
        ].join(",")).join("\n");

        const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `netscaler-cve-2026-shuns-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const executeQuickShun = async () => {
        if (!shunModalData) return;
        setShunModalData(prev => prev ? { ...prev, loading: true, error: null, result: null } : null);
        try {
            const ipsToShun = shunModalData.ips && shunModalData.ips.length > 0
                ? shunModalData.ips.filter(ip => !isPrivateIpCheck(ip))
                : (shunModalData.ip && !isPrivateIpCheck(shunModalData.ip) ? [shunModalData.ip] : []);

            if (ipsToShun.length === 0) {
                throw new Error("No valid external IP addresses specified to shun (private/RFC1918 IPs cannot be shunned).");
            }

            const res = await fetch("/api/firewall/shun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ipAddress: ipsToShun.length === 1 ? ipsToShun[0] : undefined,
                    ipAddresses: ipsToShun.length > 1 ? ipsToShun : undefined,
                    action: "add",
                    targetHost: shunModalData.targetHost
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to execute shun on firewalls.");
            }
            setShunModalData(prev => prev ? { ...prev, loading: false, result: data } : null);
        } catch (err: any) {
            setShunModalData(prev => prev ? { ...prev, loading: false, error: err.message || "Execution error" } : null);
        }
    };

    // Load initial stats or respond to URL query params
    useEffect(() => {
        const queryParam = searchParams.get("query");
        const tabParam = searchParams.get("tab");

        if (tabParam === "foreign" || tabParam === "investigate" || tabParam === "iocs") {
            setActiveTab(tabParam as any);
        }

        if (queryParam) {
            setSearchQuery(queryParam);
            setActiveTab("investigate");
            runInvestigation(queryParam, timeframe);
        }

        fetchStats(timeframe);
    }, [timeframe]);

    const fetchStats = async (range: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/netscaler/stats?range=${range}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.details || errData.error || `Failed with status ${res.status}`);
            }
            const data: NetscalerStats = await res.json();
            setStats(data);
        } catch (err: any) {
            console.error("Failed to load NetScaler stats:", err);
            setError(err.message || "Failed to load telemetry");
        } finally {
            setLoading(false);
        }
    };

    const runInvestigation = async (query: string, range: number) => {
        if (!query.trim()) return;
        setInvestigateLoading(true);
        setInvestigateError(null);
        try {
            const res = await fetch("/api/netscaler/investigate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query.trim(), range, limit: 150 })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setTimeline(data.timeline || []);
        } catch (err: any) {
            console.error("Investigation error:", err);
            setInvestigateError(err.message || "Search failed");
            setTimeline([]);
        } finally {
            setInvestigateLoading(false);
        }
    };

    const runIocScan = async (rulesToScan = iocRules, range = timeframe) => {
        setIocLoading(true);
        setIocError(null);
        try {
            const res = await fetch("/api/netscaler/iocs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules: rulesToScan, range })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setIocFindings(data.findings || []);
        } catch (err: any) {
            console.error("IOC scan error:", err);
            setIocError(err.message || "Failed to run IOC scan");
        } finally {
            setIocLoading(false);
        }
    };

    const handleAddRule = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRuleName.trim() || !newRuleQuery.trim()) return;

        const newRule: NetscalerIocRule = {
            id: `custom-${Date.now()}`,
            name: newRuleName.trim(),
            description: newRuleDesc.trim() || "Custom analyst zero-day hunt signature",
            severity: newRuleSeverity,
            query: newRuleQuery.trim(),
            category: "CUSTOM",
            cve: newRuleCve.trim() || undefined
        };

        const updated = [...iocRules, newRule];
        setIocRules(updated);
        if (typeof window !== "undefined") {
            localStorage.setItem("pane_netscaler_custom_iocs", JSON.stringify(updated));
        }

        // Reset form
        setNewRuleName("");
        setNewRuleCve("");
        setNewRuleDesc("");
        setNewRuleQuery("");
        setIsAddRuleOpen(false);

        // Run scan with new rule
        runIocScan(updated, timeframe);
    };

    const handleDeleteRule = (id: string) => {
        const updated = iocRules.filter(r => r.id !== id);
        setIocRules(updated);
        if (typeof window !== "undefined") {
            localStorage.setItem("pane_netscaler_custom_iocs", JSON.stringify(updated));
        }
        runIocScan(updated, timeframe);
    };

    const handleResetRules = () => {
        setIocRules(DEFAULT_CITRIX_IOC_RULES);
        if (typeof window !== "undefined") {
            localStorage.removeItem("pane_netscaler_custom_iocs");
        }
        runIocScan(DEFAULT_CITRIX_IOC_RULES, timeframe);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setActiveTab("investigate");
        runInvestigation(searchQuery, timeframe);
    };

    const formatTimestamp = (ts: number | string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    const formatFullTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    const filteredTimeline = timeline.filter(ev => {
        if (timelineFilter === "ALL") return true;
        return ev.eventType === timelineFilter;
    });

    const allGeoEvents = stats?.recentGeoEvents || stats?.recentForeignEvents || [];
    const filteredGeoEvents = allGeoEvents.filter(ev => {
        if (geoScope === "foreign" && ev.countryCode === "US") return false;
        if (geoScope === "us" && ev.countryCode !== "US") return false;

        if (!foreignFilter.trim()) return true;
        const q = foreignFilter.toLowerCase();
        return (
            ev.sourceIp.toLowerCase().includes(q) ||
            ev.countryCode.toLowerCase().includes(q) ||
            ev.cityName.toLowerCase().includes(q) ||
            ev.message.toLowerCase().includes(q)
        );
    });

    const filteredIocFindings = iocFindings.filter(finding => {
        if (iocFilterCve === "ALL") return true;
        if (iocFilterCve === "2026") {
            return finding.rule.cve === "CVE-2026-88771" || finding.rule.cve === "CVE-2026-88772" || finding.rule.id.includes("2026");
        }
        if (iocFilterCve === "4966") return finding.rule.cve === "CVE-2023-4966";
        if (iocFilterCve === "3519") return finding.rule.cve === "CVE-2023-3519";
        if (iocFilterCve === "CUSTOM") return finding.rule.category === "CUSTOM";
        return true;
    });

    // Aggregation of all unique external threat IPs across all matching findings
    const allUniqueMatchedIpsMap = new Map<string, NetscalerMatchedIp>();
    iocFindings.forEach(f => {
        (f.matchedExternalIps || []).forEach(m => {
            const existing = allUniqueMatchedIpsMap.get(m.ip);
            if (existing) {
                existing.count += m.count;
            } else {
                allUniqueMatchedIpsMap.set(m.ip, { ...m });
            }
        });
    });
    const allUniqueMatchedIps = Array.from(allUniqueMatchedIpsMap.values()).sort((a, b) => b.count - a.count);

    return (
        <div className="flex flex-col gap-6">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "overview"
                                ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Activity size={16} /> Overview Telemetry
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab("foreign")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "foreign"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Globe size={16} /> Geo Access & Location Intel
                            {stats?.geoTrafficCount ? (
                                <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-500/30 text-amber-200 font-mono">
                                    {stats.geoTrafficCount > 1000 ? `${(stats.geoTrafficCount / 1000).toFixed(1)}k` : stats.geoTrafficCount}
                                </span>
                            ) : null}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab("investigate")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "investigate"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Search size={16} /> User & IP Investigator
                        </span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("iocs");
                            if (iocFindings.length === 0) runIocScan();
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "iocs"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <ShieldAlert size={16} className="text-rose-400" /> Zero-Day & Threat Hunt
                        </span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("cve-shuns");
                            fetchCveShuns();
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "cve-shuns"
                                ? "bg-red-600/20 text-red-300 border border-red-500/40 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Shield size={16} className="text-rose-400" /> CVE-2026 Auto-Shun Tracker
                            {cveStats?.activeCount ? (
                                <span className="px-1.5 py-0.5 text-xs rounded-full bg-rose-500/30 text-rose-200 font-mono font-bold animate-pulse">
                                    {cveStats.activeCount}
                                </span>
                            ) : null}
                        </span>
                    </button>
                </div>

                {/* Time Range Selector & Refresh */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg bg-slate-950/70 p-1 border border-slate-800">
                        {[
                            { label: "1h", val: 3600 },
                            { label: "6h", val: 21600 },
                            { label: "12h", val: 43200 },
                            { label: "24h", val: 86400 },
                            { label: "3d", val: 259200 },
                            { label: "7d", val: 604800 },
                        ].map(t => (
                            <button
                                key={t.val}
                                onClick={() => setTimeframe(t.val)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                                    timeframe === t.val
                                        ? "bg-slate-800 text-teal-300 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => {
                            fetchStats(timeframe);
                            if (activeTab === "investigate" && searchQuery) {
                                runInvestigation(searchQuery, timeframe);
                            }
                        }}
                        disabled={loading || investigateLoading}
                        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                        title="Refresh Data"
                    >
                        <RefreshCw size={17} className={loading || investigateLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300">
                    <AlertTriangle size={20} className="shrink-0 text-red-400" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* TAB 1: OVERVIEW TELEMETRY */}
            {activeTab === "overview" && (
                <div className="flex flex-col gap-6">
                    {/* Key Metric Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider">Total Volume</span>
                                <Layers size={17} className="text-teal-400" />
                            </div>
                            <div className="text-2xl font-bold font-mono text-slate-100">
                                {loading ? "..." : (stats?.totalVolume ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Total stream events</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider">SSLVPN & Auth</span>
                                <Lock size={17} className="text-indigo-400" />
                            </div>
                            <div className="text-2xl font-bold font-mono text-indigo-300">
                                {loading ? "..." : (stats?.authVolume ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Gateway authentication flow</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider">Auth Failures</span>
                                <AlertTriangle size={17} className="text-amber-400" />
                            </div>
                            <div className="text-2xl font-bold font-mono text-amber-300">
                                {loading ? "..." : (stats?.authFailureCount ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Denied or invalid attempts</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-medium uppercase tracking-wider">ICA HDX Channels</span>
                                <Laptop size={17} className="text-emerald-400" />
                            </div>
                            <div className="text-2xl font-bold font-mono text-emerald-300">
                                {loading ? "..." : (stats?.icaSessionCount ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Citrix app & desktop sessions</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-slate-400 mb-1">
                                <span className="text-xs font-medium uppercase tracking-wider">Geo Access Intel</span>
                                <Globe size={17} className="text-blue-400" />
                            </div>
                            <div className="text-2xl font-bold font-mono text-blue-300">
                                {loading ? "..." : (stats?.geoTrafficCount ?? 0).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                                <span>🇺🇸 US: {(stats?.usTrafficCount ?? 0).toLocaleString()}</span>
                                <span>🌐 Non-US: {(stats?.foreignTrafficCount ?? 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Traffic Volume Timeline */}
                        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-200">NetScaler Gateway Event Volume</h3>
                                    <p className="text-xs text-slate-400">Activity series across selected window</p>
                                </div>
                                <span className="px-2 py-0.5 text-xs rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                                    Live Telemetry
                                </span>
                            </div>

                            <div className="h-64 w-full">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                                        Loading histogram series...
                                    </div>
                                ) : stats?.totalVolumeChart && stats.totalVolumeChart.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={stats.totalVolumeChart}>
                                            <defs>
                                                <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                            <XAxis 
                                                dataKey="timestamp" 
                                                tickFormatter={formatTimestamp} 
                                                stroke="#64748b" 
                                                fontSize={11} 
                                            />
                                            <YAxis stroke="#64748b" fontSize={11} />
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px" }}
                                                labelFormatter={(val: any) => val ? new Date(Number(val)).toLocaleString() : ""}
                                            />
                                            <Area 
                                                type="monotone" 
                                                dataKey="count" 
                                                stroke="#14b8a6" 
                                                strokeWidth={2}
                                                fillOpacity={1} 
                                                fill="url(#colorVol)" 
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                                        No histogram events found in this window.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Location Intelligence Breakdown */}
                        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-200">Location Intelligence</h3>
                                    <p className="text-xs text-slate-400">Domestic & global access points</p>
                                </div>
                                <button 
                                    onClick={() => setActiveTab("foreign")}
                                    className="text-xs text-teal-400 hover:underline flex items-center gap-1"
                                >
                                    Explore all <ChevronRight size={14} />
                                </button>
                            </div>

                            {/* View selector pills */}
                            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950/70 border border-slate-800 mb-3 text-[11px]">
                                <button
                                    onClick={() => setGeoBreakdownView("countries")}
                                    className={`px-2 py-0.5 rounded transition-all ${
                                        geoBreakdownView === "countries"
                                            ? "bg-slate-800 text-teal-300 font-semibold shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    All Countries
                                </button>
                                <button
                                    onClick={() => setGeoBreakdownView("us_cities")}
                                    className={`px-2 py-0.5 rounded transition-all ${
                                        geoBreakdownView === "us_cities"
                                            ? "bg-slate-800 text-blue-300 font-semibold shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    Top US Cities
                                </button>
                                <button
                                    onClick={() => setGeoBreakdownView("foreign")}
                                    className={`px-2 py-0.5 rounded transition-all ${
                                        geoBreakdownView === "foreign"
                                            ? "bg-slate-800 text-rose-300 font-semibold shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    Foreign Only
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col justify-center">
                                {loading ? (
                                    <div className="text-xs text-center text-slate-500">Loading location intel...</div>
                                ) : geoBreakdownView === "us_cities" ? (
                                    (stats?.topUsCities && stats.topUsCities.length > 0) ? (
                                        <div className="space-y-2.5">
                                            {stats.topUsCities.map((c) => (
                                                <div key={c.city} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                                        <span className="font-mono font-medium text-slate-300">{c.city}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-400 font-mono">{c.count.toLocaleString()} hits</span>
                                                        <button
                                                            onClick={() => {
                                                                setForeignFilter(c.city);
                                                                setGeoScope("us");
                                                                setActiveTab("foreign");
                                                            }}
                                                            className="text-slate-500 hover:text-slate-300"
                                                            title={`Filter ${c.city}`}
                                                        >
                                                            <Search size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-center text-slate-500">No US cities resolved.</div>
                                    )
                                ) : geoBreakdownView === "countries" ? (
                                    (stats?.topCountries && stats.topCountries.length > 0) ? (
                                        <div className="space-y-2.5">
                                            {stats.topCountries.map((c) => (
                                                <div key={c.country} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span 
                                                            className="w-2.5 h-2.5 rounded-full" 
                                                            style={{ backgroundColor: COUNTRY_COLORS[c.country] || "#94a3b8" }} 
                                                        />
                                                        <span className="font-mono font-medium text-slate-300">
                                                            {c.country === "US" ? "🇺🇸 United States (US)" : c.country}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-400 font-mono">{c.count.toLocaleString()} hits</span>
                                                        <button
                                                            onClick={() => {
                                                                setForeignFilter(c.country);
                                                                if (c.country === "US") setGeoScope("us");
                                                                else setGeoScope("foreign");
                                                                setActiveTab("foreign");
                                                            }}
                                                            className="text-slate-500 hover:text-slate-300"
                                                            title={`Filter ${c.country}`}
                                                        >
                                                            <Search size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-center text-slate-500">No country events logged.</div>
                                    )
                                ) : (
                                    (stats?.topForeignCountries && stats.topForeignCountries.length > 0) ? (
                                        <div className="space-y-2.5">
                                            {stats.topForeignCountries.map((c) => (
                                                <div key={c.country} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span 
                                                            className="w-2.5 h-2.5 rounded-full" 
                                                            style={{ backgroundColor: COUNTRY_COLORS[c.country] || "#94a3b8" }} 
                                                        />
                                                        <span className="font-mono font-medium text-slate-300">{c.country}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-400 font-mono">{c.count.toLocaleString()} hits</span>
                                                        <button
                                                            onClick={() => {
                                                                setForeignFilter(c.country);
                                                                setGeoScope("foreign");
                                                                setActiveTab("foreign");
                                                            }}
                                                            className="text-slate-500 hover:text-slate-300"
                                                            title={`Filter ${c.country}`}
                                                        >
                                                            <Search size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-center text-slate-500">No foreign traffic logged.</div>
                                    )
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Top Active Citrix Remote Users */}
                    {stats?.topUsers && stats.topUsers.length > 0 && (
                        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <User size={16} className="text-teal-400" />
                                    <h3 className="text-sm font-semibold text-slate-200">Top Active Remote Users</h3>
                                    <span className="text-xs text-slate-500 font-mono">({stats.topUsers.length} active)</span>
                                </div>
                                <span className="text-xs text-slate-500">Click any user to trace session timeline</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {stats.topUsers.map(u => (
                                    <button
                                        key={u.username}
                                        onClick={() => {
                                            setSearchQuery(u.username);
                                            setActiveTab("investigate");
                                            runInvestigation(u.username, timeframe);
                                        }}
                                        className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-800/40 text-left transition-all group flex flex-col justify-between"
                                    >
                                        <div className="font-mono text-xs font-semibold text-slate-200 group-hover:text-teal-300 truncate">
                                            {u.username}
                                        </div>
                                        <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                                            <span>{u.count.toLocaleString()} events</span>
                                            <ChevronRight size={13} className="text-slate-600 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: GEO ACCESS & LOCATION INTELLIGENCE */}
            {activeTab === "foreign" && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-200">Geo Access & Location Intelligence</h3>
                            <p className="text-xs text-slate-400">
                                Live NetScaler connections across domestic United States and international locations. Filter by region, investigate anomalies, or apply perimeter shuns.
                            </p>
                        </div>

                        {/* Search & Scope Filters */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Region Scope Pills */}
                            <div className="flex items-center rounded-lg bg-slate-950/70 p-1 border border-slate-800 text-xs">
                                <button
                                    onClick={() => setGeoScope("all")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        geoScope === "all"
                                            ? "bg-slate-800 text-teal-300 shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    All Locations
                                    <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-400">
                                        {(stats?.geoTrafficCount || 0).toLocaleString()}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setGeoScope("us")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        geoScope === "us"
                                            ? "bg-slate-800 text-blue-300 shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    🇺🇸 US Domestic
                                    <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-400">
                                        {(stats?.usTrafficCount || 0).toLocaleString()}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setGeoScope("foreign")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        geoScope === "foreign"
                                            ? "bg-slate-800 text-rose-300 shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    🌐 Foreign Only
                                    <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-400">
                                        {(stats?.foreignTrafficCount || 0).toLocaleString()}
                                    </span>
                                </button>
                            </div>

                            {/* Search box */}
                            <div className="relative w-64">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Filter city, country, IP, message..."
                                    value={foreignFilter}
                                    onChange={(e) => setForeignFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-950/70 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                                />
                                {foreignFilter && (
                                    <button
                                        onClick={() => setForeignFilter("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* TOP 10 SECURITY TELEMETRY CARDS (OPTION A) */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* CARD 1: Top 10 Auth Failures by Location */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <AlertOctagon size={16} className="text-rose-400 shrink-0" />
                                        <h4 className="text-xs font-semibold text-slate-200">Top 10 Auth Failures by Location</h4>
                                    </div>
                                    <div className="flex items-center rounded-md bg-slate-950/80 p-0.5 border border-slate-800 text-[10px]">
                                        <button
                                            onClick={() => setFailureScope("foreign")}
                                            className={`px-2 py-0.5 rounded transition-all ${
                                                failureScope === "foreign"
                                                    ? "bg-slate-800 text-rose-300 font-semibold shadow-sm"
                                                    : "text-slate-400 hover:text-slate-200"
                                            }`}
                                        >
                                            🌐 Foreign
                                        </button>
                                        <button
                                            onClick={() => setFailureScope("us")}
                                            className={`px-2 py-0.5 rounded transition-all ${
                                                failureScope === "us"
                                                    ? "bg-slate-800 text-blue-300 font-semibold shadow-sm"
                                                    : "text-slate-400 hover:text-slate-200"
                                            }`}
                                        >
                                            🇺🇸 US Cities
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                    {loading ? (
                                        <div className="text-xs text-center py-6 text-slate-500">Loading failure intel...</div>
                                    ) : failureScope === "foreign" ? (
                                        (stats?.topFailureForeignCountries && stats.topFailureForeignCountries.length > 0) ? (
                                            stats.topFailureForeignCountries.slice(0, 10).map((item, idx) => (
                                                <div key={item.name} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-mono text-slate-500 w-3.5 shrink-0">{idx + 1}.</span>
                                                        <span
                                                            className="w-2 h-2 rounded-full shrink-0"
                                                            style={{ backgroundColor: COUNTRY_COLORS[item.name] || "#ef4444" }}
                                                        />
                                                        <span className="font-mono text-slate-200 font-medium">{item.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="font-mono text-rose-400 font-semibold text-[11px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                                                            {item.count.toLocaleString()} fails
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setForeignFilter(item.name);
                                                                setGeoScope("foreign");
                                                            }}
                                                            className="text-slate-500 hover:text-slate-300 p-0.5"
                                                            title={`Filter table for ${item.name}`}
                                                        >
                                                            <Search size={11} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-xs text-center py-6 text-slate-500">No foreign auth failures logged in timeframe.</div>
                                        )
                                    ) : (
                                        (stats?.topFailureUsCities && stats.topFailureUsCities.length > 0) ? (
                                            stats.topFailureUsCities.slice(0, 10).map((item, idx) => (
                                                <div key={item.name} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-mono text-slate-500 w-3.5 shrink-0">{idx + 1}.</span>
                                                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                                        <span className="font-mono text-slate-200 font-medium truncate max-w-[140px]">{item.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="font-mono text-amber-400 font-semibold text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                            {item.count.toLocaleString()} fails
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setForeignFilter(item.name);
                                                                setGeoScope("us");
                                                            }}
                                                            className="text-slate-500 hover:text-slate-300 p-0.5"
                                                            title={`Filter table for ${item.name}`}
                                                        >
                                                            <Search size={11} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-xs text-center py-6 text-slate-500">No US domestic auth failures logged.</div>
                                        )
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 flex justify-between">
                                <span>Failed authentication attempts</span>
                                <span>Click search icon to filter</span>
                            </div>
                        </div>

                        {/* CARD 2: Top 10 Aggressive Remote IPs */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Flame size={16} className="text-amber-400 shrink-0" />
                                        <h4 className="text-xs font-semibold text-slate-200">Top 10 Aggressive Remote IPs</h4>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500">Fails / Hit Rate</span>
                                </div>
                                <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                    {loading ? (
                                        <div className="text-xs text-center py-6 text-slate-500">Evaluating IP velocity...</div>
                                    ) : (stats?.topAggressiveIps && stats.topAggressiveIps.length > 0) ? (
                                        stats.topAggressiveIps.slice(0, 10).map((item, idx) => (
                                            <div key={item.ip} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-[10px] font-mono text-slate-500 w-3.5 shrink-0">{idx + 1}.</span>
                                                    <span 
                                                        className="w-1.5 h-1.5 rounded-full shrink-0" 
                                                        style={{ backgroundColor: COUNTRY_COLORS[item.countryCode] || "#94a3b8" }} 
                                                    />
                                                    <button
                                                        onClick={() => setForeignFilter(item.ip)}
                                                        className="font-mono text-slate-200 hover:text-teal-400 truncate text-left font-medium"
                                                        title={`Filter table for ${item.ip}`}
                                                    >
                                                        {item.ip}
                                                    </button>
                                                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                                        ({item.countryCode}{item.cityName && item.cityName !== "N/A" ? `•${item.cityName}` : ""})
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                        item.failureCount > 0
                                                            ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                                            : "bg-slate-800 text-slate-400"
                                                    }`}>
                                                        {item.failureCount > 0 ? `${item.failureCount} fails (${item.failureRate}%)` : `${item.totalHits} hits`}
                                                    </span>
                                                    <button
                                                        onClick={() => setShunModalData({
                                                            ip: item.ip,
                                                            country: item.countryCode,
                                                            city: item.cityName,
                                                            targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                            loading: false,
                                                            result: null,
                                                            error: null
                                                        })}
                                                        className="px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] transition-colors flex items-center gap-1"
                                                        title="Perimeter Shun on Cisco Firewalls"
                                                    >
                                                        <Shield size={10} /> Shun
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-center py-6 text-slate-500">No aggressive IPs detected.</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 flex justify-between">
                                <span>High-velocity & failure sources</span>
                                <span>1-click perimeter shun</span>
                            </div>
                        </div>

                        {/* CARD 3: Top 10 Targeted User Accounts */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <UserX size={16} className="text-teal-400 shrink-0" />
                                        <h4 className="text-xs font-semibold text-slate-200">Top 10 Targeted User Accounts</h4>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500">Origins</span>
                                </div>
                                <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                    {loading ? (
                                        <div className="text-xs text-center py-6 text-slate-500">Scanning targeted accounts...</div>
                                    ) : (stats?.topTargetedUsers && stats.topTargetedUsers.length > 0) ? (
                                        stats.topTargetedUsers.slice(0, 10).map((item, idx) => (
                                            <div key={item.username} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-[10px] font-mono text-slate-500 w-3.5 shrink-0">{idx + 1}.</span>
                                                    <span className="font-mono text-slate-200 font-medium truncate max-w-[110px]" title={item.username}>
                                                        {item.username}
                                                    </span>
                                                    {item.topOrigins.length > 0 && (
                                                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono truncate max-w-[85px]" title={item.topOrigins.join(", ")}>
                                                            {item.topOrigins.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                        item.failureCount > 0
                                                            ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                                            : "bg-slate-800 text-slate-400"
                                                    }`}>
                                                        {item.failureCount > 0 ? `${item.failureCount} fails` : `${item.totalHits} hits`}
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            setSearchQuery(item.username);
                                                            setActiveTab("investigate");
                                                            runInvestigation(item.username, timeframe);
                                                        }}
                                                        className="p-1 text-slate-500 hover:text-teal-400 transition-colors"
                                                        title={`Investigate ${item.username} session history`}
                                                    >
                                                        <Search size={11} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-xs text-center py-6 text-slate-500">No targeted user telemetry logged.</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 flex justify-between">
                                <span>Targeted usernames & origins</span>
                                <span>Click search to investigate</span>
                            </div>
                        </div>
                    </div>

                    {/* Events Table */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
                                    <tr>
                                        <th className="py-3 px-4">Timestamp</th>
                                        <th className="py-3 px-4">Region Scope</th>
                                        <th className="py-3 px-4">Country & City</th>
                                        <th className="py-3 px-4">Source IP</th>
                                        <th className="py-3 px-4">Target VServer</th>
                                        <th className="py-3 px-4">Message Snippet</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {filteredGeoEvents.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-slate-500">
                                                {loading ? "Loading connection telemetry..." : "No connection events match the selected criteria."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredGeoEvents.map((ev, idx) => {
                                            const isUs = ev.countryCode === "US";
                                            return (
                                                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-400">
                                                        {formatFullTime(ev.timestamp)}
                                                    </td>
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        {isUs ? (
                                                            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-300 font-semibold">
                                                                🇺🇸 US Domestic
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold">
                                                                🌐 Foreign
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs bg-slate-800 border border-slate-700 text-slate-200">
                                                            <span 
                                                                className="w-2 h-2 rounded-full" 
                                                                style={{ backgroundColor: COUNTRY_COLORS[ev.countryCode] || (isUs ? "#3b82f6" : "#94a3b8") }} 
                                                            />
                                                            {ev.countryCode} {ev.cityName && ev.cityName !== "N/A" ? `• ${ev.cityName}` : ""}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-medium text-slate-200">
                                                        {ev.sourceIp}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-slate-400">
                                                        {ev.vserverIp ? `${ev.vserverIp}:${ev.vserverPort || "443"}` : "-"}
                                                    </td>
                                                    <td className="py-3 px-4 max-w-md truncate text-slate-400" title={ev.message}>
                                                        {ev.message}
                                                    </td>
                                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {/* Investigate Pivot */}
                                                            <button
                                                                onClick={() => {
                                                                    setSearchQuery(ev.sourceIp);
                                                                    setActiveTab("investigate");
                                                                    runInvestigation(ev.sourceIp, timeframe);
                                                                }}
                                                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                                                                title="Investigate this IP"
                                                            >
                                                                Trace
                                                            </button>
                                                            {/* Firewall Shun Action */}
                                                            <button
                                                                onClick={() => setShunModalData({
                                                                    ip: ev.sourceIp,
                                                                    country: ev.countryCode,
                                                                    city: ev.cityName,
                                                                    targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                                    loading: false,
                                                                    result: null,
                                                                    error: null
                                                                })}
                                                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs transition-colors flex items-center gap-1"
                                                                title="Apply Perimeter Shun on Cisco Firewalls"
                                                            >
                                                                <Shield size={11} /> Shun
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: USER & IP INVESTIGATOR */}
            {activeTab === "investigate" && (
                <div className="flex flex-col gap-6">
                    {/* Search Bar */}
                    <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-center gap-3">
                            <div className="relative flex-1 w-full">
                                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Enter username (e.g. honeywell-samantha) or IP address (e.g. 108.2.64.160)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={investigateLoading || !searchQuery.trim()}
                                className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {investigateLoading ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" /> Searching...
                                    </>
                                ) : (
                                    <>
                                        <Search size={16} /> Trace User / IP
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Quick filter pills */}
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                            <span className="text-slate-500 flex items-center gap-1">
                                <Filter size={12} /> Event Type:
                            </span>
                            {[
                                { id: "ALL", label: "All Events" },
                                { id: "AUTH_SUCCESS", label: "Auth Success" },
                                { id: "AUTH_FAILURE", label: "Auth Failure" },
                                { id: "ICA_SESSION", label: "Citrix ICA / HDX" },
                                { id: "HTTP_REQUEST", label: "HTTP Requests" },
                                { id: "CONN_TERMINATE", label: "Disconnects" },
                                { id: "ADMIN_CMD", label: "Admin Commands" }
                            ].map(pill => (
                                <button
                                    key={pill.id}
                                    onClick={() => setTimelineFilter(pill.id)}
                                    className={`px-2.5 py-1 rounded-md transition-colors ${
                                        timelineFilter === pill.id
                                            ? "bg-slate-700 text-slate-100 font-medium"
                                            : "bg-slate-950/50 text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Investigation Error */}
                    {investigateError && (
                        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
                            {investigateError}
                        </div>
                    )}

                    {/* Timeline Results */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                            <span>Showing {filteredTimeline.length} events (limit 150)</span>
                            {timeline.length > 0 && (
                                <div className="flex items-center gap-3">
                                    <span>Window: last {timeframe >= 86400 ? `${timeframe / 86400}d` : `${timeframe / 3600}h`}</span>
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => openExportModal({
                                                title: `Investigator Evidence - ${searchQuery}`,
                                                query: `client_ip:"${searchQuery}" OR username:"${searchQuery}" OR message:"${searchQuery}"`,
                                                defaultTimeframe: "24h"
                                            })}
                                            className="px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-700/80 text-[11px] font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                                            title="Export full event history beyond the 150-event limit with timeframe override"
                                        >
                                            <DownloadCloud size={12} className="text-cyan-400" />
                                            <span>Bulk Export All Events</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {timeline.length === 0 && !investigateLoading ? (
                            <div className="p-12 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-500">
                                <Search size={32} className="mx-auto mb-3 opacity-40" />
                                <div className="text-sm font-medium">No NetScaler events found</div>
                                <div className="text-xs mt-1">Enter a username or IP to search authentication and session timelines.</div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredTimeline.map((ev) => (
                                    <div
                                        key={ev.id}
                                        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col gap-2"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                {/* Event badge */}
                                                {ev.eventType === "AUTH_SUCCESS" && (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                                        <CheckCircle2 size={12} /> AUTH SUCCESS
                                                    </span>
                                                )}
                                                {ev.eventType === "AUTH_FAILURE" && (
                                                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold flex items-center gap-1">
                                                        <AlertTriangle size={12} /> AUTH FAILED
                                                    </span>
                                                )}
                                                {ev.eventType === "ICA_SESSION" && (
                                                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold flex items-center gap-1">
                                                        <Laptop size={12} /> CITRIX ICA / HDX
                                                    </span>
                                                )}
                                                {ev.eventType === "HTTP_REQUEST" && (
                                                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
                                                        <Globe size={12} /> HTTP REQUEST
                                                    </span>
                                                )}
                                                {ev.eventType === "CONN_TERMINATE" && (
                                                    <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold flex items-center gap-1">
                                                        <X size={12} /> DISCONNECTED
                                                    </span>
                                                )}
                                                {ev.eventType === "ADMIN_CMD" && (
                                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                                                        <Terminal size={12} /> ADMIN CMD
                                                    </span>
                                                )}
                                                {ev.eventType === "OTHER" && (
                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                                        EVENT
                                                    </span>
                                                )}

                                                {/* Username */}
                                                {ev.username && (
                                                    <span className="font-semibold text-slate-200 flex items-center gap-1">
                                                        <User size={13} className="text-teal-400" />
                                                        {ev.username}
                                                    </span>
                                                )}

                                                {/* Client IP & Country */}
                                                {ev.clientIp && (
                                                    <span className="font-mono text-slate-400">
                                                        @ {ev.clientIp}{ev.clientPort ? `:${ev.clientPort}` : ""}
                                                    </span>
                                                )}

                                                {ev.countryCode && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                                                        {ev.countryCode} {ev.cityName ? `(${ev.cityName})` : ""}
                                                    </span>
                                                )}

                                                {ev.action && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-teal-300 font-mono border border-slate-700">
                                                        {ev.action}
                                                    </span>
                                                )}

                                                {ev.deviceSerial && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950/50 text-cyan-300 font-mono border border-cyan-800/60 flex items-center gap-1" title="Connecting Device Serial">
                                                        <Laptop size={11} className="text-cyan-400" /> #{ev.deviceSerial}
                                                    </span>
                                                )}

                                                {ev.httpPath && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-950/60 text-indigo-300 font-mono border border-indigo-800/60 truncate max-w-md flex items-center gap-1" title={`${ev.httpMethod || "GET"} ${ev.httpPath}`}>
                                                        <strong className="text-indigo-400">{ev.httpMethod || "GET"}</strong>
                                                        <span className="truncate">{ev.httpPath}</span>
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                                                {ev.sessionId && (
                                                    <span>Session: #{ev.sessionId}</span>
                                                )}
                                                <span>{formatFullTime(ev.timestamp)}</span>
                                            </div>
                                        </div>

                                        {/* Raw message preview */}
                                        <div className="text-xs font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 break-all select-all">
                                            {ev.rawMessage}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: ZERO-DAY & IOC THREAT HUNT */}
            {activeTab === "iocs" && (
                <div className="flex flex-col gap-6">
                    {/* Header Banner & Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldAlert size={18} className="text-rose-400" />
                                <h3 className="text-sm font-semibold text-slate-100">
                                    Citrix Zero-Day Threat Hunter & IOC Scanner
                                </h3>
                                <span className="px-2 py-0.5 text-[10px] rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono font-semibold">
                                    ⚡ CVE-2026-88771 • CVE-2026-88772 (CISA KEV Sigma) • CVE-2023-4966
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 max-w-3xl">
                                Audits the NetScaler stream against official CISA Sigma rules for zero-day command injection (Pitboss supervisor anomalies & shell evasion in CVE-2026-88771), DTLS memory overflows (CVE-2026-88772), WHIPSHOT/SLAPSHOT implants, and Citrix Bleed token theft.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setIocFilterCve("2026");
                                    const cisaRules = iocRules.filter(r => r.cve === "CVE-2026-88771" || r.cve === "CVE-2026-88772" || r.id.includes("2026"));
                                    runIocScan(cisaRules.length > 0 ? cisaRules : iocRules, timeframe);
                                }}
                                disabled={iocLoading}
                                className="px-3.5 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 text-xs font-semibold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                                title="Run specialized hunt for CISA CVE-2026-88771 and CVE-2026-88772 signatures"
                            >
                                <Zap size={14} className="text-rose-400" />
                                {iocLoading ? "Hunting..." : "Hunt CISA CVE-2026-88771/72"}
                            </button>
                            <button
                                onClick={() => setIsAddRuleOpen(!isAddRuleOpen)}
                                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all flex items-center gap-1.5"
                            >
                                <Plus size={14} className="text-teal-400" />
                                Add Custom Rule
                            </button>
                            <button
                                onClick={() => runIocScan(iocRules, timeframe)}
                                disabled={iocLoading}
                                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <RefreshCw size={14} className={iocLoading ? "animate-spin" : ""} />
                                {iocLoading ? "Scanning Stream..." : "Run All Threat Scans"}
                            </button>
                        </div>
                    </div>

                    {/* Add Custom 0-Day Rule Form */}
                    {isAddRuleOpen && (
                        <form onSubmit={handleAddRule} className="p-5 rounded-xl bg-slate-900/80 border border-teal-500/40 flex flex-col gap-4">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                    <Zap size={16} className="text-teal-400" />
                                    <span className="text-xs font-semibold text-slate-200">Create Future 0-Day / Custom IOC Rule</span>
                                </div>
                                <button type="button" onClick={() => setIsAddRuleOpen(false)} className="text-slate-400 hover:text-slate-200">
                                    <X size={15} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Rule Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Fall 2026 Web Gateway RCE Probe"
                                        value={newRuleName}
                                        onChange={(e) => setNewRuleName(e.target.value)}
                                        required
                                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-slate-400 block mb-1">CVE Tag (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. CVE-2026-XXXXX"
                                        value={newRuleCve}
                                        onChange={(e) => setNewRuleCve(e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-slate-400 block mb-1">Severity</label>
                                    <select
                                        value={newRuleSeverity}
                                        onChange={(e) => setNewRuleSeverity(e.target.value as any)}
                                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                                    >
                                        <option value="CRITICAL">CRITICAL</option>
                                        <option value="HIGH">HIGH</option>
                                        <option value="MEDIUM">MEDIUM</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-medium text-slate-400 block mb-1">Graylog Lucene Search Query</label>
                                <input
                                    type="text"
                                    placeholder='e.g. message:"/vpn/malicious_endpoint" OR (message:"formssso" AND message:"cmd=")'
                                    value={newRuleQuery}
                                    onChange={(e) => setNewRuleQuery(e.target.value)}
                                    required
                                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-950 border border-slate-700 text-teal-300 focus:outline-none focus:border-teal-500"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-medium text-slate-400 block mb-1">Description / Threat Context</label>
                                <input
                                    type="text"
                                    placeholder="Explain the vulnerability and what this query flags..."
                                    value={newRuleDesc}
                                    onChange={(e) => setNewRuleDesc(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-teal-500"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddRuleOpen(false)}
                                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors"
                                >
                                    Save Rule & Scan
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Threat Hunt KPI Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Active Hunt Rules</div>
                            <div className="text-2xl font-bold font-mono text-slate-100">{iocRules.length}</div>
                            <div className="text-xs text-slate-500 mt-1">Configured IOC signatures</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total IOC Detections</div>
                            <div className={`text-2xl font-bold font-mono ${
                                iocFindings.reduce((acc, f) => acc + f.matchCount, 0) > 0 ? "text-amber-400" : "text-emerald-400"
                            }`}>
                                {iocLoading ? "..." : iocFindings.reduce((acc, f) => acc + f.matchCount, 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Hits across selected window</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Critical Threat Probes</div>
                            <div className={`text-2xl font-bold font-mono ${
                                iocFindings.filter(f => f.rule.severity === "CRITICAL" && f.matchCount > 0).length > 0 ? "text-rose-400" : "text-emerald-400"
                            }`}>
                                {iocLoading ? "..." : iocFindings.filter(f => f.rule.severity === "CRITICAL" && f.matchCount > 0).length}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Rules with active matches</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Custom Rules</div>
                            <div className="text-2xl font-bold font-mono text-indigo-400">
                                {iocRules.filter(r => r.category === "CUSTOM").length}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                <button onClick={handleResetRules} className="text-slate-400 hover:text-slate-200 underline">
                                    Reset to defaults
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Error Banner */}
                    {iocError && (
                        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
                            {iocError}
                        </div>
                    )}

                    {/* Dedicated CVE-2026 Auto-Shun Guard Banner */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-rose-500/30 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                            <Shield size={18} className="text-rose-400 shrink-0" />
                            <div>
                                <span className="font-semibold text-white">Automated Zero-Day Protection: </span>
                                <span className="text-slate-300">
                                    Continuous auto-shunning is {cveStats?.autoShunEnabled ? "ACTIVE" : "PAUSED"} for CVE-2026-88771 & 88772 ({cveStats?.activeCount || 0} external attacker IPs currently quarantined).
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab("cve-shuns");
                                fetchCveShuns();
                            }}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-medium transition-colors flex items-center gap-1 shrink-0"
                        >
                            <span>Open Auto-Shun Tracker</span>
                            <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* Master External Threat Actors Discovered Deck */}
                    {allUniqueMatchedIps.length > 0 && (
                        <div className="p-5 rounded-xl bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-slate-900/60 border border-rose-500/40 shadow-lg flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                        <ShieldAlert size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white tracking-wide">
                                                Discovered External Threat Actors
                                            </h3>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                                {allUniqueMatchedIps.length} Unique Public IPs
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400">
                                            Deduplicated external IPs surfaced across active zero-day and threat hunt detections. Ready for bulk fleet perimeter shunning.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(allUniqueMatchedIps.map(x => x.ip).join("\n"), "master-all")}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
                                        title="Copy all discovered IPs to clipboard (newline separated)"
                                    >
                                        {copiedIp === "master-all" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        <span>{copiedIp === "master-all" ? "Copied!" : `Copy All (${allUniqueMatchedIps.length})`}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportIpsCsv(allUniqueMatchedIps, `netscaler-threat-ips-${Date.now()}.csv`)}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
                                        title="Download CSV export with geolocation and hit counts"
                                    >
                                        <Download size={14} />
                                        <span>Export CSV</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const ipQuery = allUniqueMatchedIps.length > 0
                                                ? `client_ip:(${allUniqueMatchedIps.map(x => `"${x.ip}"`).join(" OR ")}) OR message:(${allUniqueMatchedIps.map(x => `"${x.ip}"`).join(" OR ")})`
                                                : `*`;
                                            openExportModal({
                                                title: `All Discovered Threat Actors (${allUniqueMatchedIps.length} IPs)`,
                                                query: ipQuery,
                                                defaultTimeframe: "24h"
                                            });
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 text-xs font-medium border border-cyan-700/80 flex items-center gap-1.5 transition-colors shadow-sm"
                                        title="Export Graylog logs for all discovered threat IPs with timeframe override"
                                    >
                                        <DownloadCloud size={14} className="text-cyan-400" />
                                        <span>Bulk Export Logs</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShunModalData({
                                            ips: allUniqueMatchedIps.map(x => x.ip),
                                            ruleName: `All Threat Detections (${allUniqueMatchedIps.length} IPs)`,
                                            targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                            loading: false,
                                            result: null,
                                            error: null
                                        })}
                                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950 flex items-center gap-1.5 transition-all"
                                    >
                                        <Shield size={14} />
                                        <span>⚡ Bulk Shun All ({allUniqueMatchedIps.length}) IPs</span>
                                    </button>
                                </div>
                            </div>

                            {/* Preview table of all unique IPs */}
                            <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-medium uppercase tracking-wider sticky top-0 border-b border-slate-800">
                                        <tr>
                                            <th className="py-2 px-3">IP Address</th>
                                            <th className="py-2 px-3">Hits</th>
                                            <th className="py-2 px-3">Origin Geo</th>
                                            <th className="py-2 px-3">First Seen</th>
                                            <th className="py-2 px-3">Last Seen</th>
                                            <th className="py-2 px-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                                        {allUniqueMatchedIps.map(item => (
                                            <tr key={item.ip} className="hover:bg-slate-900/50 transition-colors">
                                                <td className="py-1.5 px-3 font-semibold text-rose-300 select-all">
                                                    {item.ip}
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                                                        {item.count}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 px-3 text-slate-300 font-sans">
                                                    {item.countryCode || "N/A"} {item.cityName && item.cityName !== "N/A" ? `• ${item.cityName}` : ""}
                                                </td>
                                                <td className="py-1.5 px-3 text-slate-400">
                                                    {formatFullTime(item.firstSeen)}
                                                </td>
                                                <td className="py-1.5 px-3 text-slate-400">
                                                    {formatFullTime(item.lastSeen)}
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-sans">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setSearchQuery(item.ip);
                                                                setActiveTab("investigate");
                                                                runInvestigation(item.ip, timeframe);
                                                            }}
                                                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors"
                                                        >
                                                            Trace
                                                        </button>
                                                        <button
                                                            onClick={() => setShunModalData({
                                                                ip: item.ip,
                                                                country: item.countryCode,
                                                                city: item.cityName,
                                                                targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                                loading: false,
                                                                result: null,
                                                                error: null
                                                            })}
                                                            className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] flex items-center gap-1 transition-colors"
                                                        >
                                                            <Shield size={10} /> Shun
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Rule & CVE Scope Filter Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mr-1">
                                <Filter size={13} className="text-teal-400" /> Filter Signatures:
                            </span>
                            <button
                                onClick={() => setIocFilterCve("ALL")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    iocFilterCve === "ALL"
                                        ? "bg-slate-800 text-teal-300 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                All Rules ({iocRules.length})
                            </button>
                            <button
                                onClick={() => setIocFilterCve("2026")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    iocFilterCve === "2026"
                                        ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                ⚡ CVE-2026-88771/72 (Latest CISA KEV)
                            </button>
                            <button
                                onClick={() => setIocFilterCve("4966")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    iocFilterCve === "4966"
                                        ? "bg-slate-800 text-purple-300 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                CVE-2023-4966 (Bleed)
                            </button>
                            <button
                                onClick={() => setIocFilterCve("3519")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    iocFilterCve === "3519"
                                        ? "bg-slate-800 text-amber-300 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                CVE-2023-3519 (Webshell/RCE)
                            </button>
                            <button
                                onClick={() => setIocFilterCve("CUSTOM")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    iocFilterCve === "CUSTOM"
                                        ? "bg-slate-800 text-indigo-300 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                Custom ({iocRules.filter(r => r.category === "CUSTOM").length})
                            </button>
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono">
                            {filteredIocFindings.length} of {iocRules.length} rules visible
                        </div>
                    </div>

                    {/* Rule Cards & Findings */}
                    <div className="space-y-4">
                        {iocLoading && iocFindings.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                                Scanning NetScaler stream for zero-day threat patterns...
                            </div>
                        ) : filteredIocFindings.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                                No IOC signatures match the selected category filter.
                            </div>
                        ) : (
                            filteredIocFindings.map((finding) => {
                                const hasMatches = finding.matchCount > 0;
                                return (
                                    <div
                                        key={finding.rule.id}
                                        className={`p-5 rounded-xl border transition-all ${
                                            hasMatches
                                                ? finding.rule.severity === "CRITICAL"
                                                    ? "bg-rose-950/20 border-rose-800/60 shadow-lg shadow-rose-950/20"
                                                    : "bg-amber-950/20 border-amber-800/60"
                                                : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2">
                                                {/* Severity */}
                                                <span className={`px-2 py-0.5 text-[10px] rounded font-bold font-mono ${
                                                    finding.rule.severity === "CRITICAL"
                                                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                        : finding.rule.severity === "HIGH"
                                                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                        : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                                                }`}>
                                                    {finding.rule.severity}
                                                </span>

                                                {/* CVE Tag */}
                                                {finding.rule.cve && (
                                                    <span className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-teal-300 border border-slate-700 font-mono font-semibold">
                                                        {finding.rule.cve}
                                                    </span>
                                                )}

                                                <h4 className="text-sm font-semibold text-slate-200">
                                                    {finding.rule.name}
                                                </h4>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {/* Detection Badge */}
                                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg font-mono flex items-center gap-1.5 ${
                                                    hasMatches
                                                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse"
                                                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                                }`}>
                                                    {hasMatches ? (
                                                        <>
                                                            <AlertTriangle size={13} /> {finding.matchCount.toLocaleString()} Matches
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 size={13} /> Clean (0 Matches)
                                                        </>
                                                    )}
                                                </span>

                                                {/* Delete button if custom rule */}
                                                {finding.rule.category === "CUSTOM" && (
                                                    <button
                                                        onClick={() => handleDeleteRule(finding.rule.id)}
                                                        className="text-slate-500 hover:text-rose-400 p-1 rounded"
                                                        title="Delete custom rule"
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-400 mb-3">{finding.rule.description}</p>

                                        {/* Query string display */}
                                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 mb-3 text-[11px] font-mono">
                                            <div className="text-slate-400 select-all truncate">
                                                <span className="text-slate-500">Query: </span>{finding.rule.query}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => openExportModal({
                                                    title: `${finding.rule.name} Forensics`,
                                                    query: finding.rule.query,
                                                    defaultTimeframe: "24h"
                                                })}
                                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-950/70 text-slate-300 hover:text-cyan-300 border border-slate-700 hover:border-cyan-700/60 text-[10px] font-sans flex items-center gap-1 shrink-0 transition-colors"
                                                title="Export logs for this query with timeframe override"
                                            >
                                                <DownloadCloud size={11} className="text-cyan-400" />
                                                <span>Bulk Export</span>
                                            </button>
                                        </div>

                                        {/* Extracted Threat Source IPs for this rule */}
                                        {hasMatches && finding.matchedExternalIps && finding.matchedExternalIps.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <ShieldAlert size={14} className="text-rose-400" />
                                                        <span className="text-xs font-semibold text-rose-300">
                                                            Extracted Threat Source IPs ({finding.matchedExternalIps.length} Unique Public IPs)
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(finding.matchedExternalIps.map(x => x.ip).join("\n"), finding.rule.id)}
                                                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                                                            title="Copy IPs for this rule to clipboard"
                                                        >
                                                            {copiedIp === finding.rule.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                            <span>{copiedIp === finding.rule.id ? "Copied" : "Copy IPs"}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => exportIpsCsv(finding.matchedExternalIps, `${finding.rule.id}-threat-ips.csv`)}
                                                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                                                            title="Export CSV for this rule"
                                                        >
                                                            <Download size={12} />
                                                            <span>CSV</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openExportModal({
                                                                title: `${finding.rule.name} Forensic Evidence`,
                                                                query: finding.matchedExternalIps && finding.matchedExternalIps.length > 0
                                                                    ? `(${finding.rule.query}) OR client_ip:(${finding.matchedExternalIps.map(x => `"${x.ip}"`).join(" OR ")})`
                                                                    : finding.rule.query,
                                                                defaultTimeframe: "24h"
                                                            })}
                                                            className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 text-xs font-medium flex items-center gap-1 transition-colors"
                                                            title="Export matching Graylog event logs beyond 10k limit with timeframe override"
                                                        >
                                                            <DownloadCloud size={12} className="text-cyan-400" />
                                                            <span>Bulk Export Logs</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShunModalData({
                                                                ips: finding.matchedExternalIps.map(x => x.ip),
                                                                ruleName: finding.rule.name,
                                                                targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                                loading: false,
                                                                result: null,
                                                                error: null
                                                            })}
                                                            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-medium flex items-center gap-1 transition-colors"
                                                        >
                                                            <Shield size={12} />
                                                            <span>⚡ Shun All ({finding.matchedExternalIps.length}) IPs</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Table of rule IPs */}
                                                <div className="overflow-x-auto max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-slate-900/90 text-[10px] text-slate-400 font-medium uppercase sticky top-0 border-b border-slate-800">
                                                            <tr>
                                                                <th className="py-1.5 px-3">IP Address</th>
                                                                <th className="py-1.5 px-3">Hits</th>
                                                                <th className="py-1.5 px-3">Origin Geo</th>
                                                                <th className="py-1.5 px-3">Last Seen</th>
                                                                <th className="py-1.5 px-3 text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                                                            {finding.matchedExternalIps.map(m => (
                                                                <tr key={m.ip} className="hover:bg-slate-900/40">
                                                                    <td className="py-1.5 px-3 font-semibold text-rose-300 select-all">
                                                                        {m.ip}
                                                                    </td>
                                                                    <td className="py-1.5 px-3">
                                                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                                                                            {m.count}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-1.5 px-3 text-slate-300 font-sans">
                                                                        {m.countryCode || "N/A"} {m.cityName && m.cityName !== "N/A" ? `• ${m.cityName}` : ""}
                                                                    </td>
                                                                    <td className="py-1.5 px-3 text-slate-400">
                                                                        {formatFullTime(m.lastSeen)}
                                                                    </td>
                                                                    <td className="py-1.5 px-3 text-right font-sans">
                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setSearchQuery(m.ip);
                                                                                    setActiveTab("investigate");
                                                                                    runInvestigation(m.ip, timeframe);
                                                                                }}
                                                                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors"
                                                                            >
                                                                                Trace
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openExportModal({
                                                                                    title: `Evidence - IP ${m.ip}`,
                                                                                    query: `client_ip:"${m.ip}" OR message:"${m.ip}"`,
                                                                                    defaultTimeframe: "24h"
                                                                                })}
                                                                                className="px-2 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 text-[10px] flex items-center gap-1 transition-colors"
                                                                                title={`Bulk export Graylog logs for ${m.ip}`}
                                                                            >
                                                                                <DownloadCloud size={10} />
                                                                                <span>Export</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShunModalData({
                                                                                    ip: m.ip,
                                                                                    country: m.countryCode,
                                                                                    city: m.cityName,
                                                                                    targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                                                    loading: false,
                                                                                    result: null,
                                                                                    error: null
                                                                                })}
                                                                                className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] flex items-center gap-1 transition-colors"
                                                                            >
                                                                                <Shield size={10} /> Shun
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Sample Detections Table */}
                                        {hasMatches && finding.sampleEvents.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                                                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                                                    <span>Recent Telemetry Detections ({finding.sampleEvents.length} samples shown)</span>
                                                    <span className="text-[11px] text-slate-500">Pivot to Firewall Shun or User Trace</span>
                                                </div>

                                                <div className="space-y-2">
                                                    {finding.sampleEvents.map((ev, sIdx) => (
                                                        <div
                                                            key={sIdx}
                                                            className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs flex flex-col gap-1.5"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-slate-400">{formatFullTime(ev.timestamp)}</span>
                                                                    {ev.sourceIp && (
                                                                        <span className="font-mono font-semibold text-slate-200">
                                                                            Source: {ev.sourceIp}
                                                                        </span>
                                                                    )}
                                                                    {ev.countryCode && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                                                                            {ev.countryCode}
                                                                        </span>
                                                                    )}
                                                                    {ev.username && (
                                                                        <span className="font-medium text-teal-300">
                                                                            User: {ev.username}
                                                                        </span>
                                                                    )}
                                                                    {ev.httpPath && (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-950/60 text-indigo-300 font-mono border border-indigo-800/60 truncate max-w-sm flex items-center gap-1">
                                                                            <strong className="text-indigo-400">{ev.httpMethod || "GET"}</strong>
                                                                            <span className="truncate">{ev.httpPath}</span>
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    {ev.sourceIp && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSearchQuery(ev.sourceIp!);
                                                                                    setActiveTab("investigate");
                                                                                    runInvestigation(ev.sourceIp!, timeframe);
                                                                                }}
                                                                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                                                                            >
                                                                                Trace IP
                                                                            </button>
                                                                                <button
                                                                                    onClick={() => setShunModalData({
                                                                                        ip: ev.sourceIp!,
                                                                                        country: ev.countryCode,
                                                                                        targetHost: firewallHosts.length > 0 ? firewallHosts[0].id : "all",
                                                                                        loading: false,
                                                                                        result: null,
                                                                                        error: null
                                                                                    })}
                                                                                    className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] flex items-center gap-1 transition-colors"
                                                                                    title="Apply Perimeter Shun on Cisco Firewalls"
                                                                                >
                                                                                    <Shield size={10} /> Shun IP
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="font-mono text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800/60 break-all select-all text-[11px]">
                                                                    {ev.message}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

            {/* CVE-2026 AUTO-SHUN & DEDICATED TRACKING TAB */}
            {activeTab === "cve-shuns" && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                    {/* Header Banner */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-rose-500/30 flex flex-wrap items-center justify-between gap-4 shadow-xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <Shield size={24} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-white tracking-wide">
                                        CVE-2026-88771 & CVE-2026-88772 Auto-Shun Protection
                                    </h3>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                        CISA KEV Dedicated Guard
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400">
                                    Autonomous zero-day detection, perimeter firewall quarantining, and lifecycle tracking specifically for CVE-2026-88771 (Supervisor crash & command injection) and CVE-2026-88772 (DTLS overflow).
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Protection Status Toggle */}
                            <button
                                type="button"
                                onClick={toggleAutoShunProtection}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all ${
                                    cveStats?.autoShunEnabled
                                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40"
                                        : "bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/40"
                                }`}
                                title="Click to toggle automated shunning protection"
                            >
                                <span className={`w-2 h-2 rounded-full ${
                                    cveStats?.autoShunEnabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                                }`} />
                                <span>{cveStats?.autoShunEnabled ? "Auto-Shun: ACTIVE" : "Auto-Shun: PAUSED"}</span>
                            </button>

                            {/* Manual Scan Cycle */}
                            <button
                                type="button"
                                onClick={triggerAutoShunCycle}
                                disabled={cycleRunning}
                                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950 flex items-center gap-1.5 transition-all disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={cycleRunning ? "animate-spin" : ""} />
                                <span>{cycleRunning ? "Running Cycle..." : "Run Detection & Shun Cycle Now"}</span>
                            </button>

                            {/* Export CSV */}
                            <button
                                type="button"
                                onClick={exportCveShunsCsv}
                                disabled={cveShuns.length === 0}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                title="Download CSV of all tracked CVE-2026 shuns"
                            >
                                <Download size={13} />
                                <span>Export CSV</span>
                            </button>

                            {/* Bulk Export Graylog Logs */}
                            <button
                                type="button"
                                onClick={() => {
                                    const activeIps = cveShuns.filter(s => s.status === "ACTIVE").map(s => s.ip);
                                    const queryStr = activeIps.length > 0 
                                        ? `client_ip:(${activeIps.map(ip => `"${ip}"`).join(" OR ")}) OR message:(${activeIps.map(ip => `"${ip}"`).join(" OR ")})`
                                        : `message:("pitboss" OR "died on signal 6" OR "died on signal 11" OR "nsppe" OR "dtls_read_bytes")`;
                                    openExportModal({
                                        title: `All Active CVE-2026 Quarantined Attackers (${activeIps.length} IPs)`,
                                        query: queryStr,
                                        defaultTimeframe: "24h"
                                    });
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 text-xs font-medium border border-cyan-700/80 flex items-center gap-1.5 transition-colors shadow-sm"
                                title="Bulk Export Graylog logs for all tracked active shunned attacker IPs"
                            >
                                <DownloadCloud size={13} className="text-cyan-400" />
                                <span>Bulk Export Evidence Logs</span>
                            </button>
                        </div>
                    </div>

                    {/* KPI Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Active Perimeter Shuns</div>
                            <div className={`text-2xl font-bold font-mono ${
                                (cveStats?.activeCount || 0) > 0 ? "text-rose-400" : "text-emerald-400"
                            }`}>
                                {cveStats?.activeCount ?? 0}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Adversary IPs currently dropped on Cisco firewalls</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">CVE-2026-88771 Detections</div>
                            <div className="text-2xl font-bold font-mono text-amber-300">
                                {cveStats?.cve88771Count ?? 0}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">Pitboss supervisor crash & cmd injection probes</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">CVE-2026-88772 Detections</div>
                            <div className="text-2xl font-bold font-mono text-purple-300">
                                {cveStats?.cve88772Count ?? 0}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">DTLS memory buffer overflow attempts</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Protection Engine Health</div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${
                                    cveStats?.lastCycleStatus === "SUCCESS" ? "bg-emerald-400" : cveStats?.lastCycleStatus === "FAILURE" ? "bg-rose-400" : "bg-slate-400"
                                }`} />
                                <span className="text-sm font-semibold text-slate-200">
                                    {cveStats?.lastCycleStatus || "STANDBY"}
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 truncate" title={cveStats?.lastCycleMessage || ""}>
                                {cveStats?.lastCycleTime ? `Last Scan: ${formatFullTime(cveStats.lastCycleTime)}` : "Awaiting first cycle"}
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                                <Filter size={13} className="text-teal-400" /> Filter:
                            </span>
                            <button
                                onClick={() => setCveFilter("ALL")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveFilter === "ALL"
                                        ? "bg-slate-800 text-teal-300 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                All Signatures ({cveStats?.totalTracked || 0})
                            </button>
                            <button
                                onClick={() => setCveFilter("88771")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveFilter === "88771"
                                        ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                ⚡ CVE-2026-88771 ({cveStats?.cve88771Count || 0})
                            </button>
                            <button
                                onClick={() => setCveFilter("88772")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveFilter === "88772"
                                        ? "bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/40 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                ⚡ CVE-2026-88772 ({cveStats?.cve88772Count || 0})
                            </button>

                            <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                            <button
                                onClick={() => setCveStatusFilter("ALL")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveStatusFilter === "ALL"
                                        ? "bg-slate-800 text-slate-200 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                All Statuses
                            </button>
                            <button
                                onClick={() => setCveStatusFilter("ACTIVE")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveStatusFilter === "ACTIVE"
                                        ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                Active Shuns ({cveStats?.activeCount || 0})
                            </button>
                            <button
                                onClick={() => setCveStatusFilter("REMOVED")}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    cveStatusFilter === "REMOVED"
                                        ? "bg-slate-800 text-slate-400 font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                Released ({cveStats?.removedCount || 0})
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Search IP, country, rule, payload..."
                                    value={cveSearch}
                                    onChange={(e) => setCveSearch(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") fetchCveShuns(); }}
                                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 w-56"
                                />
                            </div>
                            <button
                                onClick={fetchCveShuns}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700"
                            >
                                Search
                            </button>
                        </div>
                    </div>

                    {/* Dedicated Tracking Table */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden shadow-lg">
                        {cveLoading ? (
                            <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                                <RefreshCw size={14} className="animate-spin text-rose-400" />
                                <span>Loading CVE-2026 auto-shun tracking records...</span>
                            </div>
                        ) : cveShuns.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
                                <CheckCircle2 size={24} className="text-emerald-400 mb-1" />
                                <span className="text-sm font-semibold text-slate-300">No matching CVE-2026 shuns found</span>
                                <span className="text-slate-500 max-w-md">
                                    No external IP addresses match the active filter criteria. To perform a live telemetry sweep, click "Run Detection & Shun Cycle Now".
                                </span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950/80 text-[11px] text-slate-400 font-medium uppercase tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="py-2.5 px-3.5">Status</th>
                                            <th className="py-2.5 px-3.5">Adversary IP</th>
                                            <th className="py-2.5 px-3.5">Vulnerability</th>
                                            <th className="py-2.5 px-3.5">Triggering Signature</th>
                                            <th className="py-2.5 px-3.5">Hits</th>
                                            <th className="py-2.5 px-3.5">Origin Geo</th>
                                            <th className="py-2.5 px-3.5">Shunned At</th>
                                            <th className="py-2.5 px-3.5">Last Seen</th>
                                            <th className="py-2.5 px-3.5">Exploit Sample</th>
                                            <th className="py-2.5 px-3.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                                        {cveShuns.map(shun => {
                                            const isActive = shun.status === "ACTIVE";
                                            return (
                                                <tr key={shun.id} className="hover:bg-slate-900/60 transition-colors">
                                                    {/* Status */}
                                                    <td className="py-2.5 px-3.5 font-sans">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono flex items-center gap-1 w-fit ${
                                                            isActive
                                                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                                : "bg-slate-800 text-slate-400 border border-slate-700"
                                                        }`}>
                                                            {isActive ? <Shield size={10} /> : <RotateCcw size={10} />}
                                                            {shun.status}
                                                        </span>
                                                    </td>

                                                    {/* IP */}
                                                    <td className="py-2.5 px-3.5 font-semibold text-rose-300 select-all font-mono">
                                                        {shun.ip}
                                                    </td>

                                                    {/* CVE */}
                                                    <td className="py-2.5 px-3.5">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                                            shun.cve.includes("88772")
                                                                ? "bg-purple-950/60 text-purple-300 border border-purple-800/60"
                                                                : "bg-rose-950/60 text-rose-300 border border-rose-800/60"
                                                        }`}>
                                                            {shun.cve}
                                                        </span>
                                                    </td>

                                                    {/* Rule Name */}
                                                    <td className="py-2.5 px-3.5 font-sans max-w-xs">
                                                        <span className="text-slate-300 font-medium truncate block" title={shun.ruleName}>
                                                            {shun.ruleName}
                                                        </span>
                                                    </td>

                                                    {/* Hits */}
                                                    <td className="py-2.5 px-3.5">
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                                                            {shun.matchCount}
                                                        </span>
                                                    </td>

                                                    {/* Geo */}
                                                    <td className="py-2.5 px-3.5 font-sans text-slate-300">
                                                        {shun.countryCode || "N/A"} {shun.cityName && shun.cityName !== "N/A" ? `• ${shun.cityName}` : ""}
                                                    </td>

                                                    {/* Shunned At */}
                                                    <td className="py-2.5 px-3.5 text-slate-400 font-sans">
                                                        {formatFullTime(shun.shunnedAt)}
                                                    </td>

                                                    {/* Last Seen */}
                                                    <td className="py-2.5 px-3.5 text-slate-400 font-sans">
                                                        {formatFullTime(shun.lastSeenAt)}
                                                    </td>

                                                    {/* Sample */}
                                                    <td className="py-2.5 px-3.5 font-sans">
                                                        {shun.samplePayload ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedPayloadSample({
                                                                    ip: shun.ip,
                                                                    payload: shun.samplePayload!,
                                                                    rule: shun.ruleName,
                                                                    cve: shun.cve
                                                                })}
                                                                className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-teal-300 flex items-center gap-1 border border-slate-700 transition-colors"
                                                            >
                                                                <FileText size={10} /> Inspect
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-600">None</span>
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="py-2.5 px-3.5 text-right font-sans">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSearchQuery(shun.ip);
                                                                    setActiveTab("investigate");
                                                                    runInvestigation(shun.ip, timeframe);
                                                                }}
                                                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors"
                                                            >
                                                                Trace
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => openExportModal({
                                                                    title: `CVE Evidence - ${shun.ip} (${shun.cve})`,
                                                                    query: `client_ip:"${shun.ip}" OR message:"${shun.ip}"`,
                                                                    defaultTimeframe: "24h"
                                                                })}
                                                                className="px-2 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 text-[10px] flex items-center gap-1 transition-colors"
                                                                title={`Bulk export Graylog logs for ${shun.ip}`}
                                                            >
                                                                <DownloadCloud size={10} />
                                                                <span>Export</span>
                                                            </button>

                                                            {isActive ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUnshunIp(shun.ip)}
                                                                    disabled={cveActionLoading === shun.ip}
                                                                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 text-[10px] border border-slate-700 hover:border-rose-700 transition-colors disabled:opacity-50"
                                                                    title="Remove shun on firewalls and mark as REMOVED"
                                                                >
                                                                    {cveActionLoading === shun.ip ? "Working..." : "Un-Shun"}
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReshunIp(shun.ip)}
                                                                    disabled={cveActionLoading === shun.ip}
                                                                    className="px-2 py-0.5 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-[10px] border border-rose-500/40 transition-colors disabled:opacity-50"
                                                                    title="Re-apply perimeter shun on firewalls"
                                                                >
                                                                    {cveActionLoading === shun.ip ? "Working..." : "Re-Shun"}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Exploit Sample Modal */}
                    {selectedPayloadSample && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                            <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 flex flex-col gap-4 text-slate-200">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Bug size={18} className="text-rose-400" />
                                        <h3 className="text-sm font-semibold text-white">
                                            Exploit Telemetry Payload Sample
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setSelectedPayloadSample(null)}
                                        className="p-1 rounded text-slate-400 hover:text-white"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                                    <div>
                                        <span className="text-slate-500">Adversary IP: </span>
                                        <span className="font-mono font-semibold text-rose-300">{selectedPayloadSample.ip}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500">Vulnerability: </span>
                                        <span className="font-mono text-teal-300">{selectedPayloadSample.cve}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-slate-500">Signature: </span>
                                        <span className="text-slate-200">{selectedPayloadSample.rule}</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                                        <span>Raw Graylog Telemetry Log Line:</span>
                                        <button
                                            onClick={() => copyToClipboard(selectedPayloadSample.payload, "modal-sample")}
                                            className="text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1"
                                        >
                                            {copiedIp === "modal-sample" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                            <span>{copiedIp === "modal-sample" ? "Copied" : "Copy Log Line"}</span>
                                        </button>
                                    </div>
                                    <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap select-all">
                                        {selectedPayloadSample.payload}
                                    </pre>
                                </div>

                                <div className="flex justify-end pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => setSelectedPayloadSample(null)}
                                        className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* QUICK PERIMETER SHUN MODAL */}
            {shunModalData && (() => {
                const isBatch = Boolean(shunModalData.ips && shunModalData.ips.length > 0);
                const targetIps = isBatch ? shunModalData.ips! : (shunModalData.ip ? [shunModalData.ip] : []);
                const validExternalCount = targetIps.filter(ip => !isPrivateIpCheck(ip)).length;
                const privateCount = targetIps.filter(isPrivateIpCheck).length;
                const hasPrivateOnly = targetIps.length > 0 && validExternalCount === 0;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                        <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 flex flex-col gap-5 text-slate-200">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-white">
                                            {isBatch ? `Batch Perimeter Firewall Shun (${targetIps.length} IPs)` : "Perimeter Firewall Shun"}
                                        </h3>
                                        <p className="text-xs text-slate-400">Apply immediate block on Cisco ASA / Firepower firewalls</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShunModalData(null)}
                                    disabled={shunModalData.loading}
                                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Target Information */}
                            {isBatch ? (
                                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400">Target Threat Scope</span>
                                        <span className="text-xs font-semibold text-rose-300 font-mono">
                                            {targetIps.length} External IP Addresses
                                        </span>
                                    </div>
                                    {shunModalData.ruleName && (
                                        <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
                                            <span>Threat Context</span>
                                            <span className="text-slate-200 font-medium truncate max-w-xs">{shunModalData.ruleName}</span>
                                        </div>
                                    )}
                                    <div className="mt-1 pt-2 border-t border-slate-800/60">
                                        <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
                                            <span>Discovered IPs to be shunned in batch:</span>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(targetIps.join("\n"), "modal-ips")}
                                                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[10px]"
                                            >
                                                {copiedIp === "modal-ips" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                                <span>{copiedIp === "modal-ips" ? "Copied" : "Copy List"}</span>
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 rounded bg-slate-900 border border-slate-800">
                                            {targetIps.map(ip => {
                                                const isPriv = isPrivateIpCheck(ip);
                                                return (
                                                    <span
                                                        key={ip}
                                                        className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                                            isPriv
                                                                ? "bg-amber-950/40 text-amber-300 border-amber-800/60 line-through"
                                                                : "bg-rose-950/40 text-rose-300 border-rose-800/60"
                                                        }`}
                                                        title={isPriv ? "Private IP will be skipped for safety" : "Valid external threat IP"}
                                                    >
                                                        {ip}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400">Target Source IP</span>
                                        <span className="font-mono text-base font-bold text-rose-400">{shunModalData.ip}</span>
                                    </div>
                                    {(shunModalData.country || shunModalData.city) && (
                                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                                            <span>Geolocation</span>
                                            <span className="font-mono text-slate-300">
                                                {shunModalData.country} {shunModalData.city && shunModalData.city !== "N/A" ? `• ${shunModalData.city}` : ""}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Target Firewall Selector */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-slate-300">Target Firewall Node</label>
                                <select
                                    value={shunModalData.targetHost}
                                    onChange={(e) => setShunModalData({ ...shunModalData, targetHost: e.target.value })}
                                    disabled={shunModalData.loading || !!shunModalData.result}
                                    className="w-full p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-rose-500 disabled:opacity-50"
                                >
                                    {firewallHosts.map(h => (
                                        <option key={h.id} value={h.id}>{h.name}</option>
                                    ))}
                                </select>
                                <span className="text-[11px] text-slate-500">
                                    {shunModalData.targetHost === "all"
                                        ? "Will push perimeter shun across all primary and secondary firewall pairs simultaneously."
                                        : "Will execute shun on the selected firewall node."}
                                </span>
                            </div>

                            {/* Safety Warning */}
                            {hasPrivateOnly ? (
                                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                                    <AlertTriangle size={16} className="shrink-0 text-red-400" />
                                    <span>Safety Protection: All selected IP addresses are internal/RFC1918 private spaces and cannot be shunned.</span>
                                </div>
                            ) : privateCount > 0 ? (
                                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-start gap-2">
                                    <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
                                    <span>Notice: {privateCount} RFC1918 private IP(s) will be automatically skipped. Only {validExternalCount} external IP(s) will be shunned.</span>
                                </div>
                            ) : !shunModalData.result ? (
                                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-start gap-2">
                                    <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
                                    <span>Executing this shun will drop all active connections from these IPs and block new traffic at the perimeter edge. Action is audited.</span>
                                </div>
                            ) : null}

                            {/* Error Message */}
                            {shunModalData.error && (
                                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-start gap-2">
                                    <AlertTriangle size={16} className="shrink-0 text-red-400 mt-0.5" />
                                    <span>{shunModalData.error}</span>
                                </div>
                            )}

                            {/* Result Display */}
                            {shunModalData.result && (
                                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/60 text-emerald-200 text-xs flex flex-col gap-2">
                                    <div className="flex items-center gap-2 font-semibold">
                                        <CheckCircle2 size={16} className="text-emerald-400" />
                                        <span>Shun Successfully Applied on {shunModalData.result.target}</span>
                                    </div>
                                    {shunModalData.result.stdout && (
                                        <pre className="font-mono text-[11px] bg-slate-950/80 p-2 rounded border border-slate-800/80 max-h-32 overflow-y-auto text-slate-300 whitespace-pre-wrap">
                                            {shunModalData.result.stdout}
                                        </pre>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                                <Link
                                    href={shunModalData.ip ? `/queries/firewall?ip=${encodeURIComponent(shunModalData.ip)}` : "/queries/firewall"}
                                    target="_blank"
                                    className="text-xs text-slate-400 hover:text-teal-400 flex items-center gap-1 transition-colors"
                                >
                                    <ExternalLink size={12} /> Open in Firewall Console
                                </Link>

                                <div className="flex items-center gap-2">
                                    {shunModalData.result ? (
                                        <button
                                            onClick={() => setShunModalData(null)}
                                            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
                                        >
                                            Close
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setShunModalData(null)}
                                                disabled={shunModalData.loading}
                                                className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={executeQuickShun}
                                                disabled={shunModalData.loading || hasPrivateOnly || validExternalCount === 0}
                                                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-md shadow-rose-900/30 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                {shunModalData.loading ? (
                                                    <>
                                                        <RefreshCw size={13} className="animate-spin" />
                                                        Applying Shun...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Shield size={13} />
                                                        {isBatch ? `Apply Batch Shun (${validExternalCount} IPs)` : "Apply Perimeter Shun"}
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* BULK EXPORTER TIMEFRAME OVERRIDE MODAL */}
            {cveExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                    <div className="relative w-full max-w-xl rounded-2xl bg-[#161a23] border border-cyan-500/30 shadow-2xl p-6 flex flex-col gap-5 text-slate-200">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                    <DownloadCloud size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-white">
                                        Export Graylog Threat Forensics
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Graylog Bulk Exporter bypasses 10k limits with automatic time-slicing & ZIP packaging
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCveExportModal(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Investigation Context & Query */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                                <span>Target Graylog Query</span>
                                <span className="text-[11px] text-slate-400 font-mono">Stream: NetScaler ADC (5c055e3a...)</span>
                            </label>
                            <input
                                type="text"
                                value={cveExportModal.query}
                                onChange={(e) => setCveExportModal({ ...cveExportModal, query: e.target.value })}
                                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400 transition-all select-all"
                            />
                            <div className="text-[11px] text-slate-400">
                                <span className="text-slate-500 font-medium">Export Title: </span>
                                <span className="text-slate-200 font-medium">{cveExportModal.title}</span>
                            </div>
                        </div>

                        {/* TIMEFRAME OVERRIDE SELECTOR */}
                        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                                    <Clock size={14} className="text-cyan-400" />
                                    Forensic Timeframe Override
                                </label>
                                <span className="text-[11px] text-cyan-400/90 font-medium">
                                    Override detection scan window
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {/* Option 1: Current Scan Window */}
                                <button
                                    type="button"
                                    onClick={() => setCveExportModal({ ...cveExportModal, timeframeMode: "scan" })}
                                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                        cveExportModal.timeframeMode === "scan"
                                            ? "bg-cyan-950/50 border-cyan-500/80 text-white shadow-sm shadow-cyan-500/10"
                                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold">Current Scan Window</span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                                            {timeframe >= 86400 ? `${Math.round(timeframe / 86400)}d` : `${Math.round(timeframe / 3600)}h`}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1">Export only what is shown in current scan duration</p>
                                </button>

                                {/* Option 2: Past 24 Hours */}
                                <button
                                    type="button"
                                    onClick={() => setCveExportModal({ ...cveExportModal, timeframeMode: "24h" })}
                                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                        cveExportModal.timeframeMode === "24h"
                                            ? "bg-cyan-950/50 border-cyan-500/80 text-white shadow-sm shadow-cyan-500/10"
                                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold flex items-center gap-1.5">
                                            Past 24 Hours
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">RECOMMENDED</span>
                                        </span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">24h</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1">Full 24-hour day of attack recon & payload traffic</p>
                                </button>

                                {/* Option 3: Past 3 Days */}
                                <button
                                    type="button"
                                    onClick={() => setCveExportModal({ ...cveExportModal, timeframeMode: "3d" })}
                                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                        cveExportModal.timeframeMode === "3d"
                                            ? "bg-cyan-950/50 border-cyan-500/80 text-white shadow-sm shadow-cyan-500/10"
                                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold">Past 3 Days</span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">72h</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1">Multi-day campaign analysis & lateral movement</p>
                                </button>

                                {/* Option 4: Past 7 Days */}
                                <button
                                    type="button"
                                    onClick={() => setCveExportModal({ ...cveExportModal, timeframeMode: "7d" })}
                                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                                        cveExportModal.timeframeMode === "7d"
                                            ? "bg-cyan-950/50 border-cyan-500/80 text-white shadow-sm shadow-cyan-500/10"
                                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold">Past 7 Days</span>
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">168h</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1">Full dwell-time history and persistence verification</p>
                                </button>
                            </div>

                            {/* Custom Range Selector */}
                            <div className="mt-1">
                                <button
                                    type="button"
                                    onClick={() => setCveExportModal({ ...cveExportModal, timeframeMode: "custom" })}
                                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs font-medium transition-all ${
                                        cveExportModal.timeframeMode === "custom"
                                            ? "bg-cyan-950/50 border-cyan-500/80 text-white"
                                            : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <Calendar size={14} className="text-cyan-400" />
                                        Custom Date & Time Range
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">Select exact start & end</span>
                                </button>

                                {cveExportModal.timeframeMode === "custom" && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[11px] text-slate-400">Start Date & Time (Local)</label>
                                            <input
                                                type="datetime-local"
                                                value={cveExportModal.customFrom}
                                                onChange={(e) => setCveExportModal({ ...cveExportModal, customFrom: e.target.value })}
                                                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[11px] text-slate-400">End Date & Time (Local)</label>
                                            <input
                                                type="datetime-local"
                                                value={cveExportModal.customTo}
                                                onChange={(e) => setCveExportModal({ ...cveExportModal, customTo: e.target.value })}
                                                className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Routing Details */}
                        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Server size={14} className="text-teal-400" />
                                <span>Cluster: <strong className="text-slate-200">OG_GRAYLOG</strong></span>
                                <span className="text-slate-600">•</span>
                                <span>Fields: <strong className="text-slate-200">NetScaler / ADC (8 fields)</strong></span>
                            </div>
                            <span className="text-[11px] text-cyan-400 font-medium">Bypasses 10k Graylog Limits</span>
                        </div>

                        {/* Modal Actions */}
                        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={() => setCveExportModal(null)}
                                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={launchBulkExport}
                                className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-900/30 flex items-center gap-2"
                            >
                                <DownloadCloud size={14} />
                                <span>Launch in Bulk Exporter →</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
