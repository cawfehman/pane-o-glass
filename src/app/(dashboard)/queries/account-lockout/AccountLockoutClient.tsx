"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { 
    Search, UserX, AlertCircle, Shield, Wifi, Laptop, Clock, 
    Calendar, CheckCircle2, AlertTriangle, Terminal, ChevronDown, 
    ChevronUp, Copy, Check, Download, RefreshCw, Radio, HardDrive, 
    Info, ArrowRight, UserCheck, Layers, ExternalLink, Filter,
    ArrowUpDown, ArrowUp, ArrowDown, X, RotateCcw, KeyRound, Repeat,
    History, BarChart3, ChevronLeft, Users
} from "lucide-react";
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
    Tooltip, CartesianGrid, Legend 
} from "recharts";
import { PaginationControls } from "@/components/common/PaginationControls";
import { SmartSearchBar } from "@/components/common/SmartSearchBar";
import { ToolHelp } from "@/components/ToolHelp";
import { sendClientAuditLog } from "@/lib/audit-client";
import { AccountLockoutMetricsTab } from "@/components/account-lockout/AccountLockoutMetricsTab";
import type { RecentLockoutsOverview, RecentLockoutEvent } from "@/lib/account-lockout";

interface AdSecurityEvent {
    id: string;
    timestamp: string;
    eventId: string;
    eventTitle: string;
    targetUser: string;
    callerDevice: string;
    sourceIp: string;
    domainController: string;
    logonType?: number;
    logonTypeDesc?: string;
    subStatus?: string;
    subStatusDesc?: string;
    failureReason?: string;
    subjectUser?: string;
    serviceName?: string;
    processName?: string;
    rawMessage: string;
}

interface AccountLifecycleHistoryItem {
    id: string;
    timestamp: string;
    eventId: string;
    eventType: string;
    eventTitle: string;
    targetUsername: string;
    canonicalUsername: string;
    performedBy: string | null;
    domainController: string | null;
    callerComputer: string | null;
    status: "SUCCESS" | "FAILURE";
    subStatus?: string | null;
    rawMessage?: string | null;
}

interface PasswordChangeActivity {
    detected: boolean;
    type: "USER_CHANGE" | "ADMIN_RESET" | null;
    timestamp: string | null;
    performedBy: string | null;
    lockoutsAfterChange: number;
    failuresAfterChange: number;
    minutesBeforeFirstLockout: number | null;
    isHistorical?: boolean;
    daysSinceChange?: number;
    hoursSinceChange?: number;
}

interface UnlockActivity {
    detected: boolean;
    unlockCount: number;
    latestUnlockTimestamp: string | null;
    unlockedBy: string | null;
    isLoop: boolean;
    relockTimeSeconds: number | null;
}

interface IseWirelessDetails {
    source: "ISE_MNT" | "GRAYLOG_ISE";
    endpointMac: string;
    ssid: string;
    apName: string;
    siteCode: string;
    deviceProfile?: string;
    failureReason?: string;
    failureCode?: string;
    nasIp?: string;
    nasPortId?: string;
    callingStationId?: string;
    calledStationId?: string;
    authTimestamp?: string;
}

interface WorkstationDetails {
    hostname: string;
    ipAddress?: string;
    resolvedHostname?: string;
    logonType?: number;
    logonTypeDesc?: string;
    likelyCause?: string;
}

interface FailureTimelineBucket {
    time: string;
    timestamp: number;
    lockouts: number;
    failedLogons: number;
    kerberosFailures: number;
    ntlmFailures: number;
    unlocks?: number;
    passwordChanges?: number;
    total: number;
}

interface AdUserDetails {
    exists: boolean;
    sAMAccountName?: string;
    userPrincipalName?: string;
    displayName: string;
    department: string;
    title: string;
    phone: string;
    email: string;
    isEnabled?: boolean;
    isLockedOut: boolean;
}

interface LockoutInvestigationResult {
    searchedUser: string;
    canonicalUser?: string;
    adUserDetails?: AdUserDetails | null;
    rangeHours: number;
    hasLockout: boolean;
    lockoutCount: number;
    latestLockoutTimestamp: string | null;
    totalFailureEvents: number;
    passwordChangeActivity?: PasswordChangeActivity;
    unlockActivity?: UnlockActivity;
    rootCauseCategory: string;
    executiveSummary: string;
    recommendation: string;
    primaryCulprit: {
        type: "ISE_WIRELESS" | "IMPRIVATA_RADIUS" | "WORKSTATION" | "UNKNOWN";
        callerName: string;
        isIsePsn: boolean;
        isImprivata?: boolean;
        iseDetails?: IseWirelessDetails | null;
        workstationDetails?: WorkstationDetails | null;
    };
    imprivataDetails?: {
        hasImprivataActivity: boolean;
        isImprivataLockoutCulprit: boolean;
        primaryImprivataNode?: string;
        primaryGatewayName?: string;
        primaryGatewayIp?: string;
        primaryGatewayCategory?: string;
        primaryVerdict?: string;
        primaryVerdictLabel?: string;
        primaryExternalIp?: string;
        primaryExternalLocation?: string;
        primaryExternalIsp?: string;
        primaryWorkstationHostname?: string;
        primaryWorkstationIp?: string;
        primaryWorkstationMac?: string;
        totalRadiusAttempts: number;
        radiusFailures: number;
        badPasswordCount: number;
        invalidUserCount: number;
        mfaTimeoutCount: number;
        mfaChallengedCount: number;
        radiusSuccesses: number;
        essoFailures: number;
        radiusSessions: Array<{
            id: string;
            timestamp: string;
            imprivataNode: string;
            sessionTag: string;
            username: string;
            nasClientIp: string;
            nasClientName: string;
            nasShortLabel: string;
            nasCategory: string;
            status: string;
            verdict: string;
            verdictLabel: string;
            errorReason: string;
            mfaMethod?: string;
            externalClientIp?: string;
            externalCountry?: string;
            externalCity?: string;
            externalIsp?: string;
            rawMessage: string;
        }>;
        essoEvents: Array<{
            id: string;
            timestamp: string;
            eventType: string;
            username: string;
            serverIp: string;
            workstationHostname?: string;
            workstationIp?: string;
            workstationMac?: string;
            authMethod?: string;
            result: string;
            isFailure: boolean;
            rawMessage: string;
        }>;
    } | null;
    uniqueCallers: string[];
    timeline: FailureTimelineBucket[];
    events: AdSecurityEvent[];
    lifecycleHistory?: AccountLifecycleHistoryItem[];
    queriedSources: {
        adGraylogStream: string;
        iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED";
        adEventsCount: number;
        iseEventsCount: number;
    };
}

export default function AccountLockoutClient() {
    const [activeView, setActiveView] = useState<"metrics" | "investigate">("investigate");
    const [usernameInput, setUsernameInput] = useState("");
    const [rangeHours, setRangeHours] = useState<number>(24);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<LockoutInvestigationResult | null>(null);

    // Table filter, sort & pagination state
    const [eventFilter, setEventFilter] = useState<"all" | "4740" | "4625" | "4771" | "4776" | "4767" | "pwd_change" | "ticket_fail" | "4648">("all");
    const [callerFilter, setCallerFilter] = useState<string>("all");
    const [dcFilter, setDcFilter] = useState<string>("all");
    const [logonTypeFilter, setLogonTypeFilter] = useState<string>("all");
    const [tableSearch, setTableSearch] = useState("");
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState<number>(25);
    const [sortField, setSortField] = useState<"timestamp" | "eventId" | "callerDevice" | "sourceIp" | "domainController" | "status">("timestamp");
    const [sortAsc, setSortAsc] = useState<boolean>(false);
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [expandedLifecycleId, setExpandedLifecycleId] = useState<string | null>(null);
    const [showAllLifecycle, setShowAllLifecycle] = useState<boolean>(false);
    const [showImprivataSessions, setShowImprivataSessions] = useState<boolean>(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Live Account Lockouts Stream (All Users) State
    const [recentLockoutsData, setRecentLockoutsData] = useState<RecentLockoutsOverview | null>(null);
    const [recentLockoutsLoading, setRecentLockoutsLoading] = useState<boolean>(false);
    const [recentFilterType, setRecentFilterType] = useState<"ALL" | "WIRELESS" | "WORKSTATION" | "REPEAT">("ALL");
    const [recentTableSearch, setRecentTableSearch] = useState<string>("");
    const [recentPage, setRecentPage] = useState<number>(1);
    const [recentLimit, setRecentLimit] = useState<number>(25);
    const [recentSortField, setRecentSortField] = useState<"timestamp" | "username" | "callerDevice" | "domainController">("timestamp");
    const [recentSortAsc, setRecentSortAsc] = useState<boolean>(false); // Descending (newest first) by default

        const fetchRecentLockouts = useCallback(async (overrideRange?: number) => {
        const effectiveRange = overrideRange !== undefined ? overrideRange : rangeHours;
        setRecentLockoutsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/account-lockout/investigate?rangeHours=${effectiveRange}`);
            const json = await res.json();
            if (res.ok && json.data) {
                setRecentLockoutsData(json.data);
            }
        } catch (err: any) {
            console.error("Failed to load recent lockouts:", err);
        } finally {
            setRecentLockoutsLoading(false);
        }
    }, [rangeHours]);

    // Initial mount: inspect URL parameters for ?user= or ?username=, otherwise fetch all lockouts
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sp = new URLSearchParams(window.location.search);
        const targetUser = (sp.get("username") || sp.get("user") || "").trim();
        if (targetUser) {
            setUsernameInput(targetUser);
            handleSearch(undefined, rangeHours, targetUser);
        } else {
            fetchRecentLockouts(rangeHours);
        }
    }, []);

    const handleSearch = async (e?: React.FormEvent, overrideRange?: number, overrideUser?: string) => {
        if (e) e.preventDefault();
        const user = (overrideUser !== undefined ? overrideUser : usernameInput).trim();
        if (!user) return;

        const effectiveRange = overrideRange || rangeHours;
        setActiveView("investigate");
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                user,
                rangeHours: effectiveRange.toString()
            });

            const res = await fetch(`/api/account-lockout/investigate?${params.toString()}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.error || `HTTP ${res.status}: Failed to investigate account`);
            }

            setData(json.data);
            setExpandedEventId(null);
            setPage(1);
        } catch (err: any) {
            setError(err.message || "Failed to execute investigation");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Unique callers from results
    const uniqueCallers = useMemo(() => {
        if (!data) return [];
        const set = new Set<string>();
        data.events.forEach(e => {
            if (e.callerDevice && e.callerDevice !== "-") set.add(e.callerDevice);
        });
        return Array.from(set).sort();
    }, [data]);

    // Unique Domain Controllers from results
    const uniqueDcs = useMemo(() => {
        if (!data) return [];
        const set = new Set<string>();
        data.events.forEach(e => {
            if (e.domainController && e.domainController !== "-") set.add(e.domainController);
        });
        return Array.from(set).sort();
    }, [data]);

    // Unique Logon Types / Failure Reasons from results
    const uniqueLogonTypes = useMemo(() => {
        if (!data) return [];
        const set = new Set<string>();
        data.events.forEach(e => {
            const desc = e.logonTypeDesc || (e.logonType !== undefined ? `Type ${e.logonType}` : null) || e.subStatusDesc;
            if (desc) set.add(desc);
        });
        return Array.from(set).sort();
    }, [data]);

    // Counts per event ID
    const eventCounts = useMemo(() => {
        if (!data) return { all: 0, "4740": 0, "4625": 0, "4771": 0, "4776": 0, "4767": 0, pwd_change: 0, ticket_fail: 0, "4648": 0 };
        const counts: Record<string, number> = {
            all: data.events.length,
            "4740": 0,
            "4625": 0,
            "4771": 0,
            "4776": 0,
            "4767": 0,
            pwd_change: 0,
            ticket_fail: 0,
            "4648": 0
        };
        data.events.forEach(e => {
            if (e.eventId in counts) {
                counts[e.eventId]++;
            }
            if (e.eventId === "4723" || e.eventId === "4724") {
                counts.pwd_change++;
            }
            if (e.eventId === "4768" || e.eventId === "4769") {
                counts.ticket_fail++;
            }
        });
        return counts;
    }, [data]);

    // Filtered and sorted events for the table
    const filteredEvents = useMemo(() => {
        if (!data) return [];
        return data.events.filter(ev => {
            if (eventFilter !== "all") {
                if (eventFilter === "pwd_change") {
                    if (ev.eventId !== "4723" && ev.eventId !== "4724") return false;
                } else if (eventFilter === "ticket_fail") {
                    if (ev.eventId !== "4768" && ev.eventId !== "4769") return false;
                } else if (ev.eventId !== eventFilter) {
                    return false;
                }
            }
            if (callerFilter !== "all" && ev.callerDevice !== callerFilter) return false;
            if (dcFilter !== "all" && ev.domainController !== dcFilter) return false;
            if (logonTypeFilter !== "all") {
                const desc = ev.logonTypeDesc || (ev.logonType !== undefined ? `Type ${ev.logonType}` : null) || ev.subStatusDesc;
                if (desc !== logonTypeFilter) return false;
            }
            if (tableSearch.trim()) {
                const q = tableSearch.toLowerCase();
                return (
                    ev.callerDevice.toLowerCase().includes(q) ||
                    ev.domainController.toLowerCase().includes(q) ||
                    ev.sourceIp.toLowerCase().includes(q) ||
                    ev.eventId.includes(q) ||
                    (ev.subStatusDesc && ev.subStatusDesc.toLowerCase().includes(q)) ||
                    (ev.logonTypeDesc && ev.logonTypeDesc.toLowerCase().includes(q)) ||
                    (ev.failureReason && ev.failureReason.toLowerCase().includes(q)) ||
                    (ev.subjectUser && ev.subjectUser.toLowerCase().includes(q)) ||
                    (ev.serviceName && ev.serviceName.toLowerCase().includes(q)) ||
                    (ev.processName && ev.processName.toLowerCase().includes(q))
                );
            }
            return true;
        }).sort((a, b) => {
            let valA: string | number = "";
            let valB: string | number = "";

            if (sortField === "timestamp") {
                valA = new Date(a.timestamp).getTime();
                valB = new Date(b.timestamp).getTime();
            } else if (sortField === "eventId") {
                valA = a.eventId;
                valB = b.eventId;
            } else if (sortField === "callerDevice") {
                valA = a.callerDevice.toLowerCase();
                valB = b.callerDevice.toLowerCase();
            } else if (sortField === "sourceIp") {
                valA = a.sourceIp.toLowerCase();
                valB = b.sourceIp.toLowerCase();
            } else if (sortField === "domainController") {
                valA = a.domainController.toLowerCase();
                valB = b.domainController.toLowerCase();
            } else if (sortField === "status") {
                valA = (a.subStatusDesc || a.logonTypeDesc || "").toLowerCase();
                valB = (b.subStatusDesc || b.logonTypeDesc || "").toLowerCase();
            }

            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });
    }, [data, eventFilter, callerFilter, dcFilter, logonTypeFilter, tableSearch, sortField, sortAsc]);

    const totalPages = Math.max(1, Math.ceil(filteredEvents.length / limit));

    const paginatedEvents = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredEvents.slice(start, start + limit);
    }, [filteredEvents, page, limit]);

    // Keep page in bounds
    useEffect(() => {
        if (page > totalPages && totalPages > 0) {
            setPage(1);
        }
    }, [totalPages, page]);

    const handleSort = (field: "timestamp" | "eventId" | "callerDevice" | "sourceIp" | "domainController" | "status") => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(field === "timestamp" ? false : true);
        }
        setPage(1);
    };

    const hasActiveFilters = eventFilter !== "all" || callerFilter !== "all" || dcFilter !== "all" || logonTypeFilter !== "all" || tableSearch.trim() !== "";

    const resetFilters = () => {
        setEventFilter("all");
        setCallerFilter("all");
        setDcFilter("all");
        setLogonTypeFilter("all");
        setTableSearch("");
        setPage(1);
    };

    // Filtered and sorted recent lockouts for all-users table
    const filteredRecentLockouts = useMemo(() => {
        if (!recentLockoutsData?.lockouts) return [];
        return recentLockoutsData.lockouts.filter(item => {
            if (recentFilterType === "WIRELESS" && !item.isIsePsn) return false;
            if (recentFilterType === "WORKSTATION" && item.isIsePsn) return false;
            if (recentFilterType === "REPEAT" && item.userLockoutCountInWindow < 2) return false;
            if (recentTableSearch.trim()) {
                const q = recentTableSearch.toLowerCase();
                return (
                    item.username.toLowerCase().includes(q) ||
                    item.callerDevice.toLowerCase().includes(q) ||
                    item.domainController.toLowerCase().includes(q) ||
                    (item.sourceIp && item.sourceIp.toLowerCase().includes(q))
                );
            }
            return true;
        }).sort((a, b) => {
            let valA: string | number = "";
            let valB: string | number = "";

            if (recentSortField === "timestamp") {
                valA = new Date(a.timestamp).getTime();
                valB = new Date(b.timestamp).getTime();
            } else if (recentSortField === "username") {
                valA = a.username.toLowerCase();
                valB = b.username.toLowerCase();
            } else if (recentSortField === "callerDevice") {
                valA = a.callerDevice.toLowerCase();
                valB = b.callerDevice.toLowerCase();
            } else if (recentSortField === "domainController") {
                valA = a.domainController.toLowerCase();
                valB = b.domainController.toLowerCase();
            }

            if (valA < valB) return recentSortAsc ? -1 : 1;
            if (valA > valB) return recentSortAsc ? 1 : -1;
            return 0;
        });
    }, [recentLockoutsData, recentFilterType, recentTableSearch, recentSortField, recentSortAsc]);

    const totalRecentPages = Math.max(1, Math.ceil(filteredRecentLockouts.length / recentLimit));

    const paginatedRecentLockouts = useMemo(() => {
        const start = (recentPage - 1) * recentLimit;
        return filteredRecentLockouts.slice(start, start + recentLimit);
    }, [filteredRecentLockouts, recentPage, recentLimit]);

    const handleRecentSort = (field: "timestamp" | "username" | "callerDevice" | "domainController") => {
        if (recentSortField === field) {
            setRecentSortAsc(!recentSortAsc);
        } else {
            setRecentSortField(field);
            setRecentSortAsc(field === "timestamp" ? false : true);
        }
        setRecentPage(1);
    };

    const exportRecentLockoutsCsv = () => {
        if (!filteredRecentLockouts.length) return;
        const headers = "Timestamp,TargetUsername,CallerComputer,SourceType,DomainController,SourceIP,LockoutsInWindow\n";
        const rows = filteredRecentLockouts.map(e => [
            `"${e.timestamp}"`,
            `"${e.username}"`,
            `"${e.callerDevice}"`,
            `"${e.isIsePsn ? "Wireless ISE-PSN (802.1X)" : "Workstation / Server"}"`,
            `"${e.domainController}"`,
            `"${e.sourceIp || "-"}"`,
            e.userLockoutCountInWindow
        ].join(",")).join("\n");
        const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ad-account-lockouts-${recentLockoutsData?.rangeHours || 24}h-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportCsv = (onlyFiltered: boolean = false) => {
        if (!data || data.events.length === 0) return;

        const isFiltered = onlyFiltered && hasActiveFilters;
        const eventsToExport = isFiltered ? filteredEvents : data.events;

        if (eventsToExport.length === 0) return;

        const headers = [
            "Timestamp",
            "Event ID",
            "Event Title",
            "Target User",
            "Caller Device",
            "Source IP",
            "Domain Controller",
            "Logon Type",
            "SubStatus / Reason",
            "Subject / Admin User",
            "Target Service (SPN)",
            "Calling Process"
        ];

        const rows = eventsToExport.map(ev => [
            `"${ev.timestamp}"`,
            `"${ev.eventId}"`,
            `"${ev.eventTitle || ''}"`,
            `"${ev.targetUser}"`,
            `"${ev.callerDevice}"`,
            `"${ev.sourceIp}"`,
            `"${ev.domainController}"`,
            `"${ev.logonTypeDesc || (ev.logonType !== undefined ? `Type ${ev.logonType}` : '')}"`,
            `"${ev.subStatusDesc || ev.subStatus || ''}"`,
            `"${ev.subjectUser || ''}"`,
            `"${ev.serviceName || ''}"`,
            `"${ev.processName || ''}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const filterTag = isFiltered ? "_filtered" : "";
        link.setAttribute("download", `account_lockout_${data.searchedUser}${filterTag}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Audit log the export action
        const filterDetails = isFiltered
            ? `Filtered view (${eventsToExport.length} of ${data.events.length} events, eventFilter: ${eventFilter}, callerFilter: ${callerFilter}, dcFilter: ${dcFilter})`
            : `Full event stream (${eventsToExport.length} events)`;

        sendClientAuditLog(
            "ACCOUNT_LOCKOUT_EXPORT",
            `Exported ${filterDetails} to CSV for user '${data.searchedUser}' (${data.rangeHours}h lookback). Lockouts: ${data.lockoutCount}, Failures: ${data.totalFailureEvents}, Primary Culprit: ${data.primaryCulprit.callerName}`
        );
    };

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 gap-4 w-full">
            {/* Locked Top Section: Header & Search Toolbar */}
            <div className="shrink-0 flex flex-col gap-3">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <UserX size={24} className="text-amber-400" />
                            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
                                <span>Account Lockout & Auth Failure Investigator</span>
                                <ToolHelp toolId="account-lockout" iconSize={18} />
                            </h1>
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                            Correlates Domain Controller security logs (Events 4740, 4625, 4771, 4776) in Graylog with Cisco ISE Wireless telemetry to isolate lockout sources.
                        </p>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-xl border border-border-color shadow-sm">
                        <button
                            type="button"
                            onClick={() => setActiveView("metrics")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                activeView === "metrics"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                            }`}
                        >
                            <BarChart3 size={14} />
                            <span>Metrics & Overview</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView("investigate")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                activeView === "investigate"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                            }`}
                        >
                            <Search size={14} />
                            <span>User Investigator</span>
                            {data?.searchedUser && (
                                <span className="px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono">
                                    {data.searchedUser}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Primary Unified Smart Search Bar */}
                <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] shadow-sm space-y-3">
                    <SmartSearchBar
                        value={usernameInput}
                        onChange={setUsernameInput}
                        onSearch={(cleanTerm) => handleSearch(undefined, undefined, cleanTerm)}
                        onReset={() => {
                            setUsernameInput("");
                            setData(null);
                            setError(null);
                            fetchRecentLockouts();
                        }}
                        placeholder="Search Active Directory username or UPN (e.g. jdoe or jdoe@cooperhealth.edu)..."
                        buttonLabel="Investigate Account"
                        loading={loading}
                        supportedFields={["TargetUserName", "sAMAccountName", "UPN (user@cooperhealth.edu)"]}
                        examples={["jdoe", "jdoe@cooperhealth.edu", "smith-jane"]}
                        enableBooleanHelp={false}
                        autoTrimOnSearch={true}
                        typeDetector={(term) => {
                            const clean = term.trim();
                            if (clean.includes("@")) {
                                return { label: "UPN / Email", colorClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" };
                            }
                            if (/^[a-zA-Z0-9._-]+$/.test(clean) && clean.length > 0) {
                                return { label: "AD Account", colorClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" };
                            }
                            return null;
                        }}
                        filterControls={
                            <div className="flex items-center gap-1 bg-[var(--bg-background)] p-1 rounded-xl border border-border-color">
                                {[
                                    { label: "1h", hours: 1 },
                                    { label: "4h", hours: 4 },
                                    { label: "12h", hours: 12 },
                                    { label: "24h", hours: 24 },
                                    { label: "7d", hours: 168 }
                                ].map((btn) => (
                                    <button
                                        key={btn.hours}
                                        type="button"
                                        onClick={() => {
                                            setRangeHours(btn.hours);
                                            if (data?.searchedUser) {
                                                handleSearch(undefined, btn.hours);
                                            } else {
                                                fetchRecentLockouts(btn.hours);
                                            }
                                        }}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            rangeHours === btn.hours
                                                ? "bg-accent-primary text-white shadow-sm"
                                                : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                                        }`}
                                    >
                                        {btn.label}
                                    </button>
                                ))}
                            </div>
                        }
                    />

                    {/* Sub-label showing queried systems */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted font-mono pt-1">
                        <span className="flex items-center gap-1.5">
                            <HardDrive size={12} className="text-indigo-400" />
                            AD Security: <strong className="text-text-secondary">5d72ac00b209026ab42decf9</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <KeyRound size={12} className="text-purple-400" />
                            Imprivata RADIUS/SSO: <strong className="text-text-secondary">5cb4d070b2090233f76b8852 (Citrix &amp; VPN)</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Radio size={12} className="text-cyan-400" />
                            ISE-PSN Detection: <strong className="text-text-secondary">ise-psn01 - 04 (Wireless EAP)</strong>
                        </span>
                    </div>
                </div>
        </div>

        {/* Scrollable Content Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-10 space-y-6">
            {activeView === "metrics" ? (
                <AccountLockoutMetricsTab
                    rangeHours={rangeHours}
                    onRangeChange={(hours) => setRangeHours(hours)}
                    onInvestigateUser={(username, hours) => {
                        setUsernameInput(username);
                        setRangeHours(hours);
                        setActiveView("investigate");
                        handleSearch(undefined, hours, username);
                    }}
                />
            ) : (
            <>
            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading Indicator */}
            {loading && (
                <div className="p-12 text-center rounded-xl border border-border-color bg-[var(--bg-surface)]/40 space-y-3">
                    <RefreshCw size={28} className="animate-spin mx-auto text-accent-primary opacity-80" />
                    <div className="text-xs font-semibold text-text-primary">
                        Scanning Active Directory domain controllers in Graylog...
                    </div>
                    <p className="text-[11px] text-text-muted max-w-md mx-auto">
                        Correlating Event 4740 lockouts with 4625/4771 failures and evaluating Cisco ISE PSN nodes for wireless EAP authentications.
                    </p>
                </div>
            )}

            {/* Live Account Lockouts Stream (All Users) */}
            {!loading && !data && !error && (
                <div className="flex flex-col gap-4">
                    {/* Header bar with Range Selector & CSV Export */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                                <Lock size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                    <span>Recent Active Directory Account Lockouts (Event 4740)</span>
                                    {recentLockoutsLoading ? (
                                        <RefreshCw size={13} className="animate-spin text-accent-primary" />
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[11px] font-bold">
                                            {filteredRecentLockouts.length.toLocaleString()} Lockouts
                                        </span>
                                    )}
                                </h3>
                                <p className="text-xs text-text-muted mt-0.5">
                                    Chronological stream across all domain controllers in descending order. Click any row to isolate culprit workstation or ISE PSN wireless telemetry.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Timeframe Presets */}
                            <div className="flex items-center bg-[var(--bg-background)] p-1 rounded-lg border border-border-color text-xs font-semibold">
                                {[
                                    { label: "1h", hours: 1 },
                                    { label: "6h", hours: 6 },
                                    { label: "12h", hours: 12 },
                                    { label: "24h", hours: 24 },
                                    { label: "3d", hours: 72 },
                                    { label: "7d", hours: 168 },
                                ].map((t) => (
                                    <button
                                        key={t.hours}
                                        onClick={() => {
                                            setRangeHours(t.hours);
                                            fetchRecentLockouts(t.hours);
                                        }}
                                        className={`px-2.5 py-1 rounded-md transition-colors ${
                                            rangeHours === t.hours
                                                ? "bg-accent-primary text-white font-bold"
                                                : "text-text-secondary hover:text-text-primary"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => fetchRecentLockouts(rangeHours)}
                                disabled={recentLockoutsLoading}
                                className="p-2 rounded-lg bg-[var(--bg-background)] hover:bg-[var(--bg-surface-hover)] border border-border-color text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                                title="Refresh Recent Lockouts"
                            >
                                <RefreshCw size={14} className={recentLockoutsLoading ? "animate-spin text-accent-primary" : ""} />
                            </button>

                            <button
                                onClick={exportRecentLockoutsCsv}
                                disabled={filteredRecentLockouts.length === 0}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                            >
                                <Download size={13} />
                                <span>Export CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Pills & Table Search Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-xl border border-border-color">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => { setRecentFilterType("ALL"); setRecentPage(1); }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    recentFilterType === "ALL"
                                        ? "bg-accent-primary text-white"
                                        : "bg-[var(--bg-background)] text-text-secondary hover:text-text-primary border border-border-color"
                                }`}
                            >
                                All Lockouts ({recentLockoutsData?.lockouts?.length || 0})
                            </button>
                            <button
                                onClick={() => { setRecentFilterType("WIRELESS"); setRecentPage(1); }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    recentFilterType === "WIRELESS"
                                        ? "bg-cyan-600 text-white"
                                        : "bg-[var(--bg-background)] text-text-secondary hover:text-text-primary border border-border-color"
                                }`}
                            >
                                <Wifi size={12} className="text-cyan-400" />
                                <span>ISE PSN Wireless ({recentLockoutsData?.lockouts?.filter(x => x.isIsePsn).length || 0})</span>
                            </button>
                            <button
                                onClick={() => { setRecentFilterType("WORKSTATION"); setRecentPage(1); }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    recentFilterType === "WORKSTATION"
                                        ? "bg-indigo-600 text-white"
                                        : "bg-[var(--bg-background)] text-text-secondary hover:text-text-primary border border-border-color"
                                }`}
                            >
                                <Laptop size={12} className="text-indigo-400" />
                                <span>Workstations & Hosts ({recentLockoutsData?.lockouts?.filter(x => !x.isIsePsn).length || 0})</span>
                            </button>
                            <button
                                onClick={() => { setRecentFilterType("REPEAT"); setRecentPage(1); }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    recentFilterType === "REPEAT"
                                        ? "bg-rose-600 text-white"
                                        : "bg-[var(--bg-background)] text-text-secondary hover:text-text-primary border border-border-color"
                                }`}
                            >
                                <AlertTriangle size={12} className="text-rose-400" />
                                <span>Repeat Offenders ({recentLockoutsData?.lockouts?.filter(x => x.userLockoutCountInWindow >= 2).length || 0})</span>
                            </button>
                        </div>

                        <div className="relative">
                            <Search size={13} className="text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={recentTableSearch}
                                onChange={(e) => { setRecentTableSearch(e.target.value); setRecentPage(1); }}
                                placeholder="Filter username, device, DC..."
                                className="pl-8 pr-3 py-1.5 bg-[var(--bg-background)] border border-border-color rounded-lg text-xs text-text-primary placeholder:text-text-muted w-full sm:w-64 outline-none focus:border-accent-primary"
                            />
                        </div>
                    </div>

                    {/* Table Container with Internal Scroll and Pinned Pagination */}
                    <div className="border border-border-color rounded-xl overflow-hidden text-xs bg-[var(--bg-surface)] flex flex-col shadow-sm max-h-[620px]">
                        {/* Top Pagination Toolbar */}
                        {filteredRecentLockouts.length > 0 && (
                            <div className="p-3 border-b border-border-color bg-[var(--bg-surface-hover)] shrink-0">
                                <PaginationControls
                                    totalRecords={filteredRecentLockouts.length}
                                    page={recentPage}
                                    limit={recentLimit}
                                    onPageChange={setRecentPage}
                                    onLimitChange={(newLimit) => {
                                        setRecentLimit(newLimit);
                                        setRecentPage(1);
                                    }}
                                    limitOptions={[25, 50, 100, 200]}
                                    showLimitSelector={true}
                                />
                            </div>
                        )}

                        {/* Internal Scrollable Table Body */}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                            {recentLockoutsLoading ? (
                                <div className="p-12 text-center text-text-muted">
                                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-accent-primary" />
                                    <span>Scanning Active Directory Event 4740 logs across all DCs...</span>
                                </div>
                            ) : filteredRecentLockouts.length === 0 ? (
                                <div className="p-12 text-center text-text-muted">
                                    No Active Directory account lockout events recorded in the last {rangeHours} hours.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[var(--bg-surface-hover)] border-b border-border-color text-text-secondary text-[11px] uppercase tracking-wider sticky top-0 z-10 shadow-xs">
                                        <tr>
                                            <th onClick={() => handleRecentSort("timestamp")} className="p-3 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap">
                                                Timestamp
                                            </th>
                                            <th onClick={() => handleRecentSort("username")} className="p-3 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap">
                                                Locked User Account
                                            </th>
                                            <th onClick={() => handleRecentSort("callerDevice")} className="p-3 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap">
                                                Caller Machine / Host
                                            </th>
                                            <th className="p-3 whitespace-nowrap">
                                                Classification
                                            </th>
                                            <th onClick={() => handleRecentSort("domainController")} className="p-3 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap">
                                                Domain Controller
                                            </th>
                                            <th className="p-3 text-center whitespace-nowrap">
                                                Frequency
                                            </th>
                                            <th className="p-3 text-right whitespace-nowrap">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {paginatedRecentLockouts.map((item, idx) => (
                                            <tr
                                                key={`${item.timestamp}-${item.username}-${idx}`}
                                                className="hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer group"
                                                onClick={() => {
                                                    setUsernameInput(item.username);
                                                    handleSearch(undefined, rangeHours, item.username);
                                                }}
                                            >
                                                <td className="p-3 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                                                    {new Date(item.timestamp).toLocaleString([], {
                                                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                                                    })}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-mono font-bold text-text-primary text-xs flex items-center gap-1.5">
                                                        <span>{item.username}</span>
                                                        {item.userLockoutCountInWindow >= 2 && (
                                                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono text-[9px] font-bold">
                                                                {item.userLockoutCountInWindow}x
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-mono font-semibold text-xs flex items-center gap-1.5">
                                                        {item.isIsePsn ? (
                                                            <Wifi size={13} className="text-cyan-400 shrink-0" />
                                                        ) : (
                                                            <Laptop size={13} className="text-indigo-400 shrink-0" />
                                                        )}
                                                        <span className={item.isIsePsn ? "text-cyan-300" : "text-text-primary"}>
                                                            {item.callerDevice || "--"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    {item.isIsePsn ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold text-[10px]">
                                                            Wireless EAP (ISE)
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold text-[10px]">
                                                            Workstation / Host
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono text-[11px] text-text-secondary">
                                                    {item.domainController || "--"}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                                        item.userLockoutCountInWindow > 1
                                                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                                    }`}>
                                                        {item.userLockoutCountInWindow} in {rangeHours}h
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setUsernameInput(item.username);
                                                            handleSearch(undefined, rangeHours, item.username);
                                                        }}
                                                        className="px-2.5 py-1 rounded bg-accent-primary/10 hover:bg-accent-primary text-accent-primary hover:text-white border border-accent-primary/30 font-semibold text-xs transition-all flex items-center gap-1 ml-auto"
                                                    >
                                                        <span>Trace Culprit</span>
                                                        <ChevronRight size={12} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Bottom Pinned Pagination Footer */}
                        {filteredRecentLockouts.length > 0 && (
                            <div className="p-3 border-t border-border-color bg-[var(--bg-surface-hover)] shrink-0">
                                <PaginationControls
                                    totalRecords={filteredRecentLockouts.length}
                                    page={recentPage}
                                    limit={recentLimit}
                                    onPageChange={setRecentPage}
                                    onLimitChange={(newLimit) => {
                                        setRecentLimit(newLimit);
                                        setRecentPage(1);
                                    }}
                                    limitOptions={[25, 50, 100, 200]}
                                    showLimitSelector={false}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Investigation Results */}
            {!loading && data && (
                <div className="space-y-6 animate-in fade-in duration-150">
                    {/* Back to All Lockouts Navigation Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border-color bg-[var(--bg-surface)] shadow-sm">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setData(null);
                                    setUsernameInput("");
                                    fetchRecentLockouts();
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-[var(--bg-background)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-text-primary border border-border-color flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            >
                                <ChevronLeft size={14} className="text-accent-primary" />
                                <span>← Back to All Account Lockouts</span>
                            </button>
                            <div className="text-xs text-text-secondary">
                                Root-cause investigation for <span className="font-mono font-bold text-accent-primary">{data.searchedUser}</span>
                            </div>
                        </div>
                        <div className="text-xs text-text-muted flex items-center gap-2">
                            <span>Window: <strong className="text-text-secondary">{data.rangeHours}h</strong></span>
                            <span>•</span>
                            <span className="text-rose-400 font-bold">{data.lockoutCount} Lockout(s)</span>
                            <span>•</span>
                            <span>{data.totalFailureEvents} Failures</span>
                        </div>
                    </div>
                    {/* Metrics Ribbon */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Metric 1: Lockout Status */}
                        <div className={`p-4 rounded-xl border ${
                            data.hasLockout
                                ? "border-rose-500/40 bg-rose-950/20"
                                : "border-emerald-500/40 bg-emerald-950/20"
                        } flex flex-col justify-between`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Lockout State (4740)
                                </span>
                                {data.hasLockout ? (
                                    <AlertCircle size={16} className="text-rose-400" />
                                ) : (
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                )}
                            </div>
                            <div className="mt-2">
                                <div className={`text-xl font-bold font-mono ${data.hasLockout ? "text-rose-400" : "text-emerald-400"}`}>
                                    {data.hasLockout ? `${data.lockoutCount} LOCKOUT EVENT${data.lockoutCount > 1 ? 'S' : ''}` : "NO LOCKOUTS"}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    {data.latestLockoutTimestamp 
                                        ? `Last: ${new Date(data.latestLockoutTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : `Within last ${data.rangeHours} hours`}
                                </div>
                            </div>
                        </div>

                        {/* Metric 2: Primary Culprit */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Identified Culprit
                                </span>
                                {data.primaryCulprit.isIsePsn ? (
                                    <Wifi size={16} className="text-cyan-400" />
                                ) : data.primaryCulprit.isImprivata ? (
                                    <KeyRound size={16} className="text-purple-400" />
                                ) : (
                                    <Laptop size={16} className="text-indigo-400" />
                                )}
                            </div>
                            <div className="mt-2">
                                <div className="text-lg font-bold font-mono text-cyan-300 truncate" title={data.primaryCulprit.callerName}>
                                    {data.primaryCulprit.callerName}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    {data.primaryCulprit.isIsePsn
                                        ? "Cisco ISE Wireless (EAP)"
                                        : data.primaryCulprit.isImprivata
                                        ? `Imprivata RADIUS (${data.imprivataDetails?.primaryGatewayCategory || "VPN / Citrix"})`
                                        : "Windows Workstation / Host"}
                                </div>
                            </div>
                        </div>

                        {/* Metric 3: Total Failure Events */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Total Failures (4625/4771)
                                </span>
                                <Clock size={16} className="text-amber-400" />
                            </div>
                            <div className="mt-2">
                                <div className="text-xl font-bold font-mono text-amber-400">
                                    {data.totalFailureEvents.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    Across {data.uniqueCallers.length || 1} unique calling device(s)
                                </div>
                            </div>
                        </div>

                        {/* Metric 4: User & Action */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Queried Target
                                </span>
                                <button
                                    onClick={() => handleExportCsv(false)}
                                    title="Export full event audit stream to CSV"
                                    className="text-xs text-accent-primary hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <Download size={13} />
                                    <span>Export All CSV</span>
                                </button>
                            </div>
                            <div className="mt-2">
                                <div className="text-lg font-bold font-mono text-text-primary truncate">
                                    {data.searchedUser}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    Window: Last {data.rangeHours} hour{data.rangeHours > 1 ? "s" : ""}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Active Directory Identity & Real-Time Status Card */}
                    {data.adUserDetails?.exists && (
                        <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-950/15 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shrink-0">
                                    <Shield size={16} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-text-primary text-sm">
                                            {data.adUserDetails.displayName || data.searchedUser}
                                        </span>
                                        <span className="text-[11px] text-text-muted font-mono">
                                            ({data.searchedUser})
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                            data.adUserDetails.isLockedOut
                                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                        }`}>
                                            {data.adUserDetails.isLockedOut ? "AD Flag: LOCKED OUT" : "AD Flag: Normal (Not Locked)"}
                                        </span>
                                        {data.adUserDetails.isEnabled === false && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-zinc-500/20 text-zinc-300 border-zinc-500/40">
                                                Account Disabled
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-3 flex-wrap">
                                        {data.adUserDetails.title && <span>Title: <strong className="text-zinc-200">{data.adUserDetails.title}</strong></span>}
                                        {data.adUserDetails.department && <span>Dept: <strong className="text-zinc-200">{data.adUserDetails.department}</strong></span>}
                                        {data.adUserDetails.email && <span>Email: <strong className="text-zinc-200">{data.adUserDetails.email}</strong></span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Lockout Loop Alert Banner */}
                    {data.unlockActivity?.isLoop && (
                        <div className="p-3.5 rounded-xl border border-rose-500/50 bg-rose-950/30 text-xs flex items-start gap-3 animate-pulse shadow-sm">
                            <Repeat size={18} className="text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-rose-300 uppercase tracking-wide text-[11px]">
                                        Critical: Active Lockout Loop Detected
                                    </span>
                                    {data.unlockActivity.relockTimeSeconds !== null && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/40 font-mono font-bold">
                                            Re-locked in {data.unlockActivity.relockTimeSeconds}s
                                        </span>
                                    )}
                                </div>
                                <p className="text-zinc-200 leading-relaxed text-xs">
                                    The account was unlocked {data.unlockActivity.unlockedBy ? `by ${data.unlockActivity.unlockedBy}` : ""} at {new Date(data.unlockActivity.latestUnlockTimestamp!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}, but was immediately re-locked by continuous authentication failures from <strong className="text-rose-300 font-mono">{data.primaryCulprit.callerName}</strong>. 
                                    <strong className="text-white block mt-0.5">⚠️ Do NOT unlock the account again until device {data.primaryCulprit.callerName} is disconnected, has forgotten Wi-Fi, or cleared cached credentials.</strong>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Password Change Correlation Banner */}
                    {data.passwordChangeActivity?.detected && (
                        <div className="p-3.5 rounded-xl border border-cyan-500/40 bg-cyan-950/20 text-xs flex items-start gap-3 shadow-sm">
                            <KeyRound size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-cyan-300 uppercase tracking-wide text-[11px]">
                                        Password Change Correlated ({data.passwordChangeActivity.type === "USER_CHANGE" ? "User Self-Service 4723" : "Administrative Reset 4724"})
                                    </span>
                                    {data.passwordChangeActivity.isHistorical && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono font-bold flex items-center gap-1">
                                            <History size={10} /> Persistent DB Sync
                                        </span>
                                    )}
                                    {data.passwordChangeActivity.lockoutsAfterChange > 0 && (
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                                            {data.passwordChangeActivity.lockoutsAfterChange} lockout(s) post-change
                                        </span>
                                    )}
                                </div>
                                <p className="text-zinc-300 leading-relaxed text-xs">
                                    Password was updated on <strong className="text-white">{new Date(data.passwordChangeActivity.timestamp!).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</strong> at {new Date(data.passwordChangeActivity.timestamp!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    {data.passwordChangeActivity.daysSinceChange !== undefined && (
                                        <span className="text-cyan-200"> ({data.passwordChangeActivity.daysSinceChange >= 1 ? `${data.passwordChangeActivity.daysSinceChange} day(s) ago` : `${data.passwordChangeActivity.hoursSinceChange || 1} hr(s) ago`})</span>
                                    )}
                                    {data.passwordChangeActivity.performedBy ? ` by ${data.passwordChangeActivity.performedBy}` : ""}.
                                    {data.passwordChangeActivity.minutesBeforeFirstLockout !== null && (
                                        <span> First lockout occurred <strong>{data.passwordChangeActivity.minutesBeforeFirstLockout} min</strong> after rotation.</span>
                                    )}
                                    <span> Originating machine <strong className="text-cyan-300 font-mono">{data.primaryCulprit.callerName}</strong> is attempting authentication with outdated credentials.</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Executive Verdict Banner */}
                    <div className={`p-4 rounded-xl border ${
                        data.hasLockout
                            ? "border-rose-500/40 bg-rose-950/15"
                            : data.totalFailureEvents > 0
                            ? "border-amber-500/40 bg-amber-950/15"
                            : "border-emerald-500/40 bg-emerald-950/15"
                    } space-y-3`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Shield size={16} className={data.hasLockout ? "text-rose-400" : "text-emerald-400"} />
                                    <h3 className="text-sm font-bold text-text-primary">
                                        Executive Root Cause Verdict
                                    </h3>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                        data.hasLockout
                                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    }`}>
                                        {data.rootCauseCategory.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <p className="text-xs text-text-primary leading-relaxed">
                                    {data.executiveSummary}
                                </p>
                            </div>
                        </div>

                        {/* Remediation Callout */}
                        <div className="p-3 rounded-lg bg-[var(--bg-background)]/80 border border-border-color/80 flex items-start gap-2.5 text-xs text-text-secondary">
                            <Info size={14} className="text-accent-primary shrink-0 mt-0.5" />
                            <div>
                                <strong className="text-text-primary">Actionable Recommendation: </strong>
                                {data.recommendation}
                            </div>
                        </div>
                    </div>

                    {/* Deep-Dive Culprit Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Card 1: Wireless EAP / Cisco ISE Diagnostic */}
                        {data.primaryCulprit.isIsePsn && (
                            <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/15 space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <Wifi size={14} className="text-cyan-400" />
                                        Cisco ISE Wireless Forensics ({data.primaryCulprit.callerName})
                                    </span>
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                        Source: {data.primaryCulprit.iseDetails?.source === "ISE_MNT" ? "Live ISE MnT" : "Graylog ISE 3.0"}
                                    </span>
                                </div>

                                {data.primaryCulprit.iseDetails ? (
                                    <div className="space-y-3 text-xs">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Client MAC Address</span>
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <span className="text-cyan-300 font-bold">{data.primaryCulprit.iseDetails.endpointMac}</span>
                                                    <button
                                                        onClick={() => handleCopy(data.primaryCulprit.iseDetails!.endpointMac, "mac")}
                                                        className="text-text-muted hover:text-white"
                                                        title="Copy MAC"
                                                    >
                                                        {copiedId === "mac" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Connected SSID</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate">
                                                    {data.primaryCulprit.iseDetails.ssid}
                                                </span>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Access Point (AP)</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate" title={data.primaryCulprit.iseDetails.apName}>
                                                    {data.primaryCulprit.iseDetails.apName}
                                                </span>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Device / Endpoint Profile</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate">
                                                    {data.primaryCulprit.iseDetails.deviceProfile || "Standard 802.1X Client"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-2.5 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">EAP Failure Reason</span>
                                            <span className="text-rose-400 font-mono text-[11px] mt-0.5 block">
                                                {data.primaryCulprit.iseDetails.failureReason}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-6 text-center text-text-muted text-xs">
                                        ISE PSN detected in AD events. Live auth record expired or rolling over in ISE MnT.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Card 2: Workstation Diagnostics */}
                        {!data.primaryCulprit.isIsePsn && !data.primaryCulprit.isImprivata && data.primaryCulprit.workstationDetails && (
                            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/15 space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <Laptop size={14} className="text-indigo-400" />
                                        Workstation / Host Diagnostics ({data.primaryCulprit.callerName})
                                    </span>
                                    {data.primaryCulprit.workstationDetails.logonTypeDesc && (
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                            {data.primaryCulprit.workstationDetails.logonTypeDesc}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-3 text-xs">
                                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                        <div className="p-2 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">Computer Name</span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-indigo-300 font-bold">{data.primaryCulprit.workstationDetails.hostname}</span>
                                                <button
                                                    onClick={() => handleCopy(data.primaryCulprit.workstationDetails!.hostname, "pc")}
                                                    className="text-text-muted hover:text-white"
                                                    title="Copy Hostname"
                                                >
                                                    {copiedId === "pc" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-2 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">IP Address</span>
                                            <span className="text-text-primary font-bold mt-0.5 block">
                                                {data.primaryCulprit.workstationDetails.ipAddress || "Resolved via DC"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-2.5 rounded bg-black/40 border border-border-color">
                                        <span className="text-text-muted block text-[10px] uppercase">Probable Cause</span>
                                        <span className="text-text-primary text-[11px] mt-0.5 block">
                                            {data.primaryCulprit.workstationDetails.likelyCause}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Card 2b: Imprivata RADIUS & OneSign SSO Diagnostics (Citrix NetScaler / FTD VPN / Clinical Kiosk) */}
                        {data.imprivataDetails?.hasImprivataActivity && (
                            <div className="p-4 rounded-xl border border-purple-500/35 bg-purple-950/15 space-y-3.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <KeyRound size={14} className="text-purple-400" />
                                        Imprivata RADIUS &amp; SSO Forensics ({data.imprivataDetails.primaryImprivataNode || "as07a"})
                                    </span>
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                        {data.imprivataDetails.totalRadiusAttempts} RADIUS · {data.imprivataDetails.essoEvents.length} ESSO
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                    <div className="p-2 rounded bg-black/40 border border-border-color">
                                        <span className="text-text-muted block text-[10px] uppercase">Originating Gateway (NAS Client)</span>
                                        <span className="text-purple-300 font-bold mt-0.5 block truncate" title={data.imprivataDetails.primaryGatewayName}>
                                            {data.imprivataDetails.primaryGatewayName || "Imprivata OneSign"}
                                        </span>
                                    </div>

                                    <div className="p-2 rounded bg-black/40 border border-border-color">
                                        <span className="text-text-muted block text-[10px] uppercase">External Client IP / Workstation</span>
                                        <div className="flex items-center justify-between mt-0.5 gap-1">
                                            <span className="text-amber-300 font-bold truncate">
                                                {data.imprivataDetails.primaryExternalIp ||
                                                    data.imprivataDetails.primaryWorkstationHostname ||
                                                    data.imprivataDetails.primaryGatewayIp ||
                                                    "Internal"}
                                            </span>
                                            {data.imprivataDetails.primaryExternalIp && (
                                                <a
                                                    href={
                                                        data.imprivataDetails.primaryGatewayCategory === "CITRIX"
                                                            ? `/queries/netscaler?query=${encodeURIComponent(data.imprivataDetails.primaryExternalIp)}`
                                                            : `/queries/vpn-reporting?q=${encodeURIComponent(data.searchedUser)}`
                                                    }
                                                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5 shrink-0"
                                                    title="Pivot to Gateway Logs"
                                                >
                                                    <span>Pivot</span>
                                                    <ExternalLink size={10} />
                                                </a>
                                            )}
                                        </div>
                                        {(data.imprivataDetails.primaryExternalLocation || data.imprivataDetails.primaryExternalIsp) && (
                                            <span className="text-[10px] text-text-muted block truncate mt-0.5">
                                                {[data.imprivataDetails.primaryExternalLocation, data.imprivataDetails.primaryExternalIsp]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[11px]">
                                    <div className="p-1.5 rounded bg-rose-950/30 border border-rose-500/30">
                                        <span className="block text-[9px] uppercase text-rose-300">Bad AD Pass</span>
                                        <span className="font-bold text-rose-400">{data.imprivataDetails.badPasswordCount}</span>
                                    </div>
                                    <div className="p-1.5 rounded bg-amber-950/30 border border-amber-500/30">
                                        <span className="block text-[9px] uppercase text-amber-300">MFA Timeout</span>
                                        <span className="font-bold text-amber-400">{data.imprivataDetails.mfaTimeoutCount}</span>
                                    </div>
                                    <div className="p-1.5 rounded bg-emerald-950/30 border border-emerald-500/30">
                                        <span className="block text-[9px] uppercase text-emerald-300">2FA Passed</span>
                                        <span className="font-bold text-emerald-400">{data.imprivataDetails.radiusSuccesses}</span>
                                    </div>
                                    <div className="p-1.5 rounded bg-indigo-950/30 border border-indigo-500/30">
                                        <span className="block text-[9px] uppercase text-indigo-300">Kiosk Fails</span>
                                        <span className="font-bold text-indigo-400">{data.imprivataDetails.essoFailures}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11px] text-text-secondary">
                                        Verdict:{" "}
                                        <strong className="text-purple-300">
                                            {data.imprivataDetails.primaryVerdictLabel || "Imprivata Session Correlated"}
                                        </strong>
                                    </span>
                                    {data.imprivataDetails.radiusSessions.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowImprivataSessions(!showImprivataSessions)}
                                            className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer"
                                        >
                                            <span>
                                                {showImprivataSessions
                                                    ? "Hide Sessions"
                                                    : `View ${data.imprivataDetails.radiusSessions.length} RADIUS Sessions`}
                                            </span>
                                            {showImprivataSessions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </button>
                                    )}
                                </div>

                                {showImprivataSessions && data.imprivataDetails.radiusSessions.length > 0 && (
                                    <div className="max-h-56 overflow-y-auto rounded-lg border border-border-color bg-black/40 divide-y divide-border-color/60 text-[11px] font-mono">
                                        {data.imprivataDetails.radiusSessions.slice(0, 25).map((s) => (
                                            <div key={s.id} className="p-2 flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="text-text-secondary">
                                                        {new Date(s.timestamp).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            second: "2-digit",
                                                        })}{" "}
                                                        · <strong className="text-purple-300">{s.imprivataNode}</strong> [{s.sessionTag}]
                                                    </span>
                                                    <span
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            s.status === "FAILED"
                                                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                                                : s.status === "CHALLENGED"
                                                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                                        }`}
                                                    >
                                                        {s.verdictLabel}
                                                    </span>
                                                </div>
                                                <div className="text-text-muted flex items-center justify-between gap-2 flex-wrap">
                                                    <span>Gateway: <strong className="text-zinc-200">{s.nasShortLabel}</strong></span>
                                                    {s.externalClientIp && (
                                                        <span>
                                                            Client IP: <strong className="text-amber-300">{s.externalClientIp}</strong>{" "}
                                                            {s.externalCountry ? `(${s.externalCountry})` : ""}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-zinc-400 truncate" title={s.errorReason}>
                                                    {s.errorReason}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Caller Distribution Card */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                                <Layers size={14} className="text-accent-primary" />
                                All Calling Devices Seen in Time Window ({data.uniqueCallers.length})
                            </span>
                            <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                                {data.uniqueCallers.map((caller, idx) => {
                                    const isIse = /ise-psn0[1-4]/i.test(caller);
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-background)] border border-border-color text-xs">
                                            <div className="flex items-center gap-2">
                                                {isIse ? <Wifi size={13} className="text-cyan-400" /> : <Laptop size={13} className="text-indigo-400" />}
                                                <span className="font-mono font-bold text-text-primary">{caller}</span>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                isIse ? "bg-cyan-500/20 text-cyan-300" : "bg-zinc-800 text-zinc-300"
                                            }`}>
                                                {isIse ? "ISE Wireless PSN" : "Workstation / DC"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Timeline Activity Chart */}
                    {data.timeline.length > 0 && (
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                    <Clock size={14} className="text-accent-primary" />
                                    Failure Frequency & Lockout Timeline
                                </span>
                                <span className="text-[11px] text-text-muted">
                                    {data.timeline.length} interval data points
                                </span>
                            </div>

                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="failedLogonsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="lockoutsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                                        <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                                        <YAxis stroke="var(--text-muted)" fontSize={10} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "var(--bg-surface)",
                                                borderColor: "var(--border-color)",
                                                borderRadius: "8px",
                                                fontSize: "12px"
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                                        <Area
                                            type="monotone"
                                            dataKey="failedLogons"
                                            stroke="#f59e0b"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#failedLogonsGrad)"
                                            name="Logon Failures (4625/4771/4776)"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="lockouts"
                                            stroke="#ef4444"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#lockoutsGrad)"
                                            name="Lockouts (4740)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Active Directory Account Lifecycle & Password History Card */}
                    {data.lifecycleHistory && data.lifecycleHistory.length > 0 && (
                        <div className="p-4 rounded-xl border border-cyan-500/30 bg-[var(--bg-surface)] space-y-3 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-color/60 pb-3">
                                <div className="flex items-center gap-2">
                                    <History size={18} className="text-cyan-400 shrink-0" />
                                    <div>
                                        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                            Active Directory Account Lifecycle & Password History
                                            <span className="text-xs px-2 py-0.5 rounded-full font-mono font-normal bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                                                {data.lifecycleHistory.length} recorded {data.lifecycleHistory.length === 1 ? "event" : "events"}
                                            </span>
                                        </h3>
                                        <p className="text-[11px] text-text-secondary mt-0.5">
                                            Continuously synchronized to PostgreSQL from Graylog Stream <strong className="font-mono text-zinc-300">5d72ac00b209026ab42decf9</strong> every 10 minutes.
                                        </p>
                                    </div>
                                </div>
                                {data.lifecycleHistory.length > 5 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllLifecycle(!showAllLifecycle)}
                                        className="text-xs font-semibold text-accent-primary hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                                    >
                                        <span>{showAllLifecycle ? "Show Top 5" : `Show All (${data.lifecycleHistory.length})`}</span>
                                        {showAllLifecycle ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2">
                                {(showAllLifecycle ? data.lifecycleHistory : data.lifecycleHistory.slice(0, 5)).map((item) => {
                                    const isExpanded = expandedLifecycleId === item.id;
                                    const isPwd = item.eventId === "4723" || item.eventId === "4724";
                                    const isUnlock = item.eventId === "4767";
                                    const isFail = item.status === "FAILURE";

                                    return (
                                        <div
                                            key={item.id}
                                            className={`rounded-xl border transition-all text-xs ${
                                                isPwd
                                                    ? "bg-cyan-950/15 border-cyan-500/30"
                                                    : isUnlock
                                                    ? "bg-amber-950/15 border-amber-500/30"
                                                    : "bg-[var(--bg-background)]/70 border-border-color"
                                            }`}
                                        >
                                            <div
                                                onClick={() => setExpandedLifecycleId(isExpanded ? null : item.id)}
                                                className="p-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02]"
                                            >
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                                        isPwd
                                                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                            : isUnlock
                                                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                            : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                                                    }`}>
                                                        Event {item.eventId}
                                                    </span>

                                                    <span className="font-bold text-text-primary">
                                                        {item.eventTitle}
                                                    </span>

                                                    <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                                                        isFail
                                                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4 text-text-secondary text-[11px] font-mono ml-auto">
                                                    {item.performedBy && (
                                                        <span>
                                                            Actor: <strong className="text-zinc-200">{item.performedBy}</strong>
                                                        </span>
                                                    )}
                                                    {item.domainController && (
                                                        <span className="hidden md:inline">
                                                            DC: <strong className="text-zinc-300">{item.domainController}</strong>
                                                        </span>
                                                    )}
                                                    <span>
                                                        {new Date(item.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                    <span className="text-text-muted">
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </span>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="p-3 border-t border-border-color/60 bg-black/40 space-y-2">
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                                                        <div>
                                                            <span className="text-text-muted block text-[10px] uppercase">Target User</span>
                                                            <span className="text-text-primary font-bold">{item.canonicalUsername || item.targetUsername}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-text-muted block text-[10px] uppercase">Domain Controller</span>
                                                            <span className="text-text-primary font-bold">{item.domainController || "Unknown"}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-text-muted block text-[10px] uppercase">Caller / Workstation</span>
                                                            <span className="text-text-primary font-bold">{item.callerComputer || "N/A"}</span>
                                                        </div>
                                                    </div>

                                                    {item.rawMessage && (
                                                        <div className="pt-2">
                                                            <div className="flex items-center justify-between text-[10px] text-text-muted uppercase mb-1">
                                                                <span>Raw Security Event Log</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleCopy(item.rawMessage!, item.id);
                                                                    }}
                                                                    className="flex items-center gap-1 text-accent-primary hover:underline cursor-pointer"
                                                                >
                                                                    {copiedId === item.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                                                    <span>{copiedId === item.id ? "Copied" : "Copy Payload"}</span>
                                                                </button>
                                                            </div>
                                                            <pre className="p-2.5 rounded bg-black/60 border border-border-color text-[11px] font-mono text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                                                {item.rawMessage}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Detailed Event Stream Table */}
                    <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3 shadow-sm">
                        {/* Table Header & Event ID Tabs */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border-color/60 pb-3">
                            <div className="flex items-center gap-2">
                                <Terminal size={18} className="text-indigo-400 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                        Correlated Active Directory Event Stream
                                        <span className="text-xs px-2 py-0.5 rounded-full font-mono font-normal bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                                            {filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-text-secondary mt-0.5">
                                        Click any row to expand the full forensic payload and Windows security event message inline.
                                    </p>
                                </div>
                            </div>

                            {/* Event ID Filter Tabs */}
                            <div className="flex items-center gap-1 bg-[var(--bg-background)] p-1 rounded-xl border border-border-color text-xs font-mono flex-wrap">
                                {[
                                    { id: "all", label: "All", count: eventCounts.all },
                                    { id: "4740", label: "4740 (Lockout)", count: eventCounts["4740"] },
                                    { id: "4625", label: "4625 (Fail)", count: eventCounts["4625"] },
                                    { id: "4771", label: "4771 (Kerb)", count: eventCounts["4771"] },
                                    { id: "4776", label: "4776 (NTLM)", count: eventCounts["4776"] },
                                    { id: "4767", label: "4767 (Unlock)", count: eventCounts["4767"] },
                                    { id: "pwd_change", label: "4723/24 (Pwd)", count: eventCounts.pwd_change },
                                    { id: "ticket_fail", label: "4768/69 (Ticket)", count: eventCounts.ticket_fail },
                                    { id: "4648", label: "4648 (Explicit)", count: eventCounts["4648"] }
                                ].filter(tab => tab.id === "all" || tab.count > 0 || ["4740", "4625", "4771", "4776"].includes(tab.id)).map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setEventFilter(tab.id as any);
                                            setPage(1);
                                        }}
                                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                                            eventFilter === tab.id
                                                ? "bg-accent-primary text-white font-bold shadow-sm"
                                                : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                            eventFilter === tab.id ? "bg-white/20 text-white" : "bg-white/5 text-text-muted"
                                        }`}>
                                            {tab.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Column Filter Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[var(--bg-background)]/60 p-2.5 rounded-xl border border-border-color/60 text-xs">
                            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                                <div className="flex-1 min-w-[220px] max-w-sm">
                                    <SmartSearchBar
                                        value={tableSearch}
                                        onChange={(val) => {
                                            setTableSearch(val);
                                            setPage(1);
                                        }}
                                        onReset={() => {
                                            setTableSearch("");
                                            setPage(1);
                                        }}
                                        placeholder="Filter IP, caller, DC, reason..."
                                        enableLiveFiltering={true}
                                        hideSubmitButton={true}
                                        enableBooleanHelp={false}
                                        autoTrimOnSearch={false}
                                    />
                                </div>

                                {/* Caller Machine Filter Dropdown */}
                                <div className="flex items-center gap-1">
                                    <select
                                        value={callerFilter}
                                        onChange={(e) => {
                                            setCallerFilter(e.target.value);
                                            setPage(1);
                                        }}
                                        className="px-2.5 py-1.5 text-xs rounded-lg border border-border-color bg-[var(--bg-surface)] text-text-primary focus:outline-none focus:border-accent-primary font-mono cursor-pointer max-w-[180px] truncate"
                                        title="Filter by Caller Machine"
                                    >
                                        <option value="all">All Callers ({uniqueCallers.length})</option>
                                        {uniqueCallers.map(caller => (
                                            <option key={caller} value={caller}>
                                                {caller}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Domain Controller Filter Dropdown */}
                                <div className="flex items-center gap-1">
                                    <select
                                        value={dcFilter}
                                        onChange={(e) => {
                                            setDcFilter(e.target.value);
                                            setPage(1);
                                        }}
                                        className="px-2.5 py-1.5 text-xs rounded-lg border border-border-color bg-[var(--bg-surface)] text-text-primary focus:outline-none focus:border-accent-primary font-mono cursor-pointer max-w-[160px] truncate"
                                        title="Filter by Domain Controller"
                                    >
                                        <option value="all">All DCs ({uniqueDcs.length})</option>
                                        {uniqueDcs.map(dc => (
                                            <option key={dc} value={dc}>
                                                {dc}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Logon Type / Reason Filter Dropdown */}
                                {uniqueLogonTypes.length > 0 && (
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={logonTypeFilter}
                                            onChange={(e) => {
                                                setLogonTypeFilter(e.target.value);
                                                setPage(1);
                                            }}
                                            className="px-2.5 py-1.5 text-xs rounded-lg border border-border-color bg-[var(--bg-surface)] text-text-primary focus:outline-none focus:border-accent-primary font-mono cursor-pointer max-w-[200px] truncate"
                                            title="Filter by Logon Type or Reason"
                                        >
                                            <option value="all">All Logon Types ({uniqueLogonTypes.length})</option>
                                            {uniqueLogonTypes.map(t => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {hasActiveFilters && (
                                    <button
                                        onClick={resetFilters}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg border border-rose-500/30 transition-all cursor-pointer font-semibold"
                                        title="Reset all table filters"
                                    >
                                        <RotateCcw size={12} />
                                        <span>Reset Filters</span>
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => handleExportCsv(true)}
                                title={hasActiveFilters ? "Export filtered events to CSV" : "Export full event stream to CSV"}
                                className="px-3 py-1.5 rounded-lg border border-border-color bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-text-primary text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm font-semibold ml-auto"
                            >
                                <Download size={13} className="text-accent-primary" />
                                <span>{hasActiveFilters ? `Export Filtered (${filteredEvents.length})` : "Export CSV"}</span>
                            </button>
                        </div>

                        {/* Top Pagination Toolbar */}
                        {filteredEvents.length > 0 && (
                            <div className="pt-1 pb-1">
                                <PaginationControls
                                    totalRecords={filteredEvents.length}
                                    page={page}
                                    limit={limit}
                                    limitOptions={[10, 25, 50, 100]}
                                    onPageChange={setPage}
                                    onLimitChange={(newLimit) => {
                                        setLimit(newLimit);
                                        setPage(1);
                                    }}
                                    showLimitSelector={true}
                                />
                            </div>
                        )}

                        {/* Table */}
                        <div className="border border-border-color rounded-xl overflow-hidden text-xs bg-[var(--bg-background)] flex flex-col max-h-[620px] shadow-sm">
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[var(--bg-surface-hover)] border-b border-border-color text-text-secondary text-[11px] uppercase tracking-wider sticky top-0 z-10 select-none">
                                        <tr>
                                            <th 
                                                onClick={() => handleSort("timestamp")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Time</span>
                                                    {sortField === "timestamp" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleSort("eventId")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Event</span>
                                                    {sortField === "eventId" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleSort("callerDevice")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Caller / Machine</span>
                                                    {sortField === "callerDevice" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleSort("sourceIp")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Source IP</span>
                                                    {sortField === "sourceIp" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleSort("domainController")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Domain Controller</span>
                                                    {sortField === "domainController" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleSort("status")}
                                                className="p-2.5 cursor-pointer hover:text-text-primary transition-colors whitespace-nowrap"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span>Logon Type / Status</span>
                                                    {sortField === "status" ? (
                                                        sortAsc ? <ArrowUp size={12} className="text-accent-primary" /> : <ArrowDown size={12} className="text-accent-primary" />
                                                    ) : (
                                                        <ArrowUpDown size={11} className="text-text-muted opacity-50" />
                                                    )}
                                                </div>
                                            </th>
                                            <th className="p-2.5 text-right whitespace-nowrap">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color/60 font-mono text-[11px]">
                                        {paginatedEvents.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-text-muted font-sans">
                                                    No Active Directory events match your filter criteria.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedEvents.map((ev) => {
                                                const isExpanded = expandedEventId === ev.id;
                                                const isLockout = ev.eventId === "4740";
                                                const isUnlock = ev.eventId === "4767";
                                                const isPwdChange = ev.eventId === "4723" || ev.eventId === "4724";
                                                return (
                                                    <React.Fragment key={ev.id}>
                                                        <tr 
                                                            className={`hover:bg-[var(--bg-surface-hover)]/60 cursor-pointer transition-colors ${
                                                                isExpanded ? "bg-[var(--bg-surface-hover)]" : isLockout ? "bg-rose-950/20" : isUnlock ? "bg-emerald-950/20" : isPwdChange ? "bg-cyan-950/20" : ""
                                                            }`}
                                                            onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                                        >
                                                            <td className="p-2.5 text-text-secondary whitespace-nowrap font-mono">
                                                                {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                            </td>
                                                            <td className="p-2.5 whitespace-nowrap">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    isLockout
                                                                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                                        : isUnlock
                                                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                                                        : isPwdChange
                                                                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                                                        : ev.eventId === "4768" || ev.eventId === "4769"
                                                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                                                        : ev.eventId === "4648"
                                                                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                                                        : ev.eventId === "4625"
                                                                        ? "bg-rose-950/40 text-rose-300 border border-rose-800/40"
                                                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                                }`}>
                                                                    {ev.eventId}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-cyan-300 font-bold whitespace-nowrap font-mono">
                                                                {ev.callerDevice}
                                                            </td>
                                                            <td className="p-2.5 text-text-muted whitespace-nowrap font-mono">
                                                                {ev.sourceIp}
                                                            </td>
                                                            <td className="p-2.5 text-text-secondary whitespace-nowrap font-mono">
                                                                {ev.domainController}
                                                            </td>
                                                            <td className="p-2.5 text-text-secondary max-w-xs truncate" title={ev.subStatusDesc || ev.logonTypeDesc}>
                                                                {ev.subStatusDesc || ev.logonTypeDesc || (ev.subStatus ? `Code ${ev.subStatus}` : "-")}
                                                            </td>
                                                            <td className="p-2.5 text-right whitespace-nowrap text-text-muted">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedEventId(isExpanded ? null : ev.id);
                                                                    }}
                                                                    className="p-1 rounded hover:bg-white/10 transition-colors text-text-secondary hover:text-white cursor-pointer"
                                                                    title={isExpanded ? "Collapse event payload" : "Expand event payload"}
                                                                >
                                                                    {isExpanded ? <ChevronUp size={16} className="text-cyan-400" /> : <ChevronDown size={16} />}
                                                                </button>
                                                            </td>
                                                        </tr>

                                                        {/* Inline Expanded Row */}
                                                        {isExpanded && (
                                                            <tr className="bg-black/75 border-b border-indigo-500/30">
                                                                <td colSpan={7} className="p-4 space-y-3 font-sans">
                                                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-color/60 pb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <Terminal size={14} className="text-cyan-400" />
                                                                            <span className="font-bold text-text-primary text-xs">
                                                                                Windows Event {ev.eventId} — {ev.eventTitle || "Logon Audit"}
                                                                            </span>
                                                                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-mono">
                                                                                {ev.domainController}
                                                                            </span>
                                                                            <span className="text-[10px] text-text-muted font-mono">
                                                                                {new Date(ev.timestamp).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleCopy(ev.rawMessage, ev.id);
                                                                            }}
                                                                            className="px-2.5 py-1 rounded text-[11px] border border-border-color bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-all cursor-pointer shadow-sm font-semibold"
                                                                        >
                                                                            {copiedId === ev.id ? (
                                                                                <>
                                                                                    <Check size={12} className="text-emerald-400" />
                                                                                    <span className="text-emerald-400">Copied!</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Copy size={12} />
                                                                                    <span>Copy Raw Log</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </div>

                                                                    {/* Triage Badges */}
                                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                                                                        <div className="p-2 rounded bg-white/5 border border-white/5">
                                                                            <span className="text-text-muted text-[10px] block uppercase font-sans">Target User</span>
                                                                            <span className="text-text-primary font-bold">{ev.targetUser}</span>
                                                                        </div>
                                                                        <div className="p-2 rounded bg-white/5 border border-white/5">
                                                                            <span className="text-text-muted text-[10px] block uppercase font-sans">Caller Device</span>
                                                                            <span className="text-cyan-300 font-bold">{ev.callerDevice}</span>
                                                                        </div>
                                                                        <div className="p-2 rounded bg-white/5 border border-white/5">
                                                                            <span className="text-text-muted text-[10px] block uppercase font-sans">Source IP</span>
                                                                            <span className="text-text-secondary">{ev.sourceIp}</span>
                                                                        </div>
                                                                        <div className="p-2 rounded bg-white/5 border border-white/5">
                                                                            <span className="text-text-muted text-[10px] block uppercase font-sans">Logon Type / SubStatus</span>
                                                                            <span className="text-amber-300 truncate block" title={ev.subStatusDesc || ev.logonTypeDesc}>
                                                                                {ev.logonTypeDesc || ev.subStatusDesc || (ev.subStatus ? `0x${ev.subStatus}` : "-")}
                                                                            </span>
                                                                        </div>
                                                                        {ev.subjectUser && (
                                                                            <div className="p-2 rounded bg-cyan-950/30 border border-cyan-800/40">
                                                                                <span className="text-cyan-400 text-[10px] block uppercase font-sans">Subject / Performed By</span>
                                                                                <span className="text-cyan-200 font-bold">{ev.subjectUser}</span>
                                                                            </div>
                                                                        )}
                                                                        {ev.serviceName && (
                                                                            <div className="p-2 rounded bg-purple-950/30 border border-purple-800/40">
                                                                                <span className="text-purple-400 text-[10px] block uppercase font-sans">Target Service (SPN)</span>
                                                                                <span className="text-purple-200 font-bold truncate block" title={ev.serviceName}>{ev.serviceName}</span>
                                                                            </div>
                                                                        )}
                                                                        {ev.processName && (
                                                                            <div className="p-2 rounded bg-blue-950/30 border border-blue-800/40">
                                                                                <span className="text-blue-400 text-[10px] block uppercase font-sans">Calling Process</span>
                                                                                <span className="text-blue-200 font-bold truncate block" title={ev.processName}>{ev.processName}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Raw Security Event Payload */}
                                                                    <pre className="text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed p-3 bg-black/95 rounded-lg border border-border-color max-h-60 overflow-y-auto font-mono select-text">
                                                                        {ev.rawMessage}
                                                                    </pre>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Bottom Pinned Pagination Footer */}
                        {filteredEvents.length > 0 && (
                            <div className="pt-2 border-t border-border-color/60">
                                <PaginationControls
                                    totalRecords={filteredEvents.length}
                                    page={page}
                                    limit={limit}
                                    onPageChange={setPage}
                                    showLimitSelector={false}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
            </>
            )}
            </div>
        </div>
    );
}
