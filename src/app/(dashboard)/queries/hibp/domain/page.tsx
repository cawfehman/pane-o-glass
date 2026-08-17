"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { 
    ShieldCheck, Download, Mail, UserCheck, Users, 
    FileSpreadsheet, ChevronDown, AlertTriangle, KeyRound, 
    Filter, Database, Layers, CheckCircle2 
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";

export default function DomainSecurityPage() {
    // Domain Search State
    const [domainStr, setDomainStr] = useState("");
    const [availableDomains, setAvailableDomains] = useState<{ DomainName: string }[]>([]);
    const [domainLoading, setDomainLoading] = useState(false);
    const [domainError, setDomainError] = useState("");
    const [domainResults, setDomainResults] = useState<{ 
        hasBreaches: boolean, 
        aliases: Record<string, string[]>, 
        adEnrichment: Record<string, any> 
    } | null>(null);
    const [activeView, setActiveView] = useState<"all" | "breaches" | "summary" | null>(null);
    const [expandedAlias, setExpandedAlias] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"domain" | "breach">("domain");

    // Breaches Metadata (loaded once)
    const [allBreachesMeta, setAllBreachesMeta] = useState<Record<string, any>>({});
    const [sortConfig, setSortConfig] = useState<{ key: 'count' | 'date', desc: boolean }>({ key: 'count', desc: true });

    // Breach & Category Search State
    const [searchMode, setSearchMode] = useState<"breachName" | "dataCategory">("breachName");
    const [breachSearchQuery, setBreachSearchQuery] = useState("");
    const [breachSearchView, setBreachSearchView] = useState<"details" | "impacted" | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("Passwords");
    const [categorySearchView, setCategorySearchView] = useState<"breaches" | "impacted" | null>(null);
    const [breachSearchLoading, setBreachSearchLoading] = useState(false);
    const [breachSearchError, setBreachSearchError] = useState("");

    // Fetch available domains on load
    useEffect(() => {
        const fetchDomains = async () => {
            try {
                const res = await fetch("/api/hibp-subscribed-domains");
                if (res.ok) {
                    const data = await res.json();
                    setAvailableDomains(data);
                    if (data.length > 0) {
                        setDomainStr(data[0].DomainName);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch subscribed domains", e);
            }
        };

        const fetchBreachesMeta = async () => {
            try {
                const res = await fetch("/api/hibp-breaches");
                if (res.ok) {
                    const data = await res.json();
                    const metaMap: Record<string, any> = {};
                    data.forEach((b: any) => metaMap[b.Name] = b);
                    setAllBreachesMeta(metaMap);
                }
            } catch (e) {
                console.error("Failed to fetch breaches metadata", e);
            }
        };

        fetchDomains();
        fetchBreachesMeta();
    }, []);

    const fetchDomainData = async () => {
        setDomainLoading(true);
        setDomainError("");
        setDomainResults(null);

        try {
            const res = await fetch("/api/hibp-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain: domainStr }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to query HIBP Domain API");
            }

            const data = await res.json();
            setDomainResults(data);
            return data;
        } catch (err: any) {
            setDomainError(err.message || "An unexpected error occurred");
            return null;
        } finally {
            setDomainLoading(false);
        }
    };

    const triggerView = async (viewType: "all" | "breaches" | "summary") => {
        setActiveView(viewType);
        if (!domainResults) {
            await fetchDomainData();
        }
    };

    // --- Data Classes & Password Detection Helpers ---

    const breachHasPassword = (breach: any) => {
        if (!breach || !Array.isArray(breach.DataClasses)) return false;
        return breach.DataClasses.some((dc: string) => dc.toLowerCase().includes("password"));
    };

    const breachHasCategory = (breach: any, cat: string) => {
        if (!breach || !Array.isArray(breach.DataClasses)) return false;
        return breach.DataClasses.some((dc: string) => dc.toLowerCase() === cat.toLowerCase());
    };

    const allDataClasses = useMemo(() => {
        const set = new Set<string>();
        Object.values(allBreachesMeta).forEach((b: any) => {
            if (Array.isArray(b.DataClasses)) {
                b.DataClasses.forEach((dc: string) => set.add(dc));
            }
        });
        const list = Array.from(set).sort((a, b) => a.localeCompare(b));
        if (list.includes("Passwords")) {
            return ["Passwords", ...list.filter(x => x !== "Passwords")];
        }
        return list;
    }, [allBreachesMeta]);

    const getBreachesForCategory = (category: string) => {
        return Object.values(allBreachesMeta).filter((b: any) =>
            breachHasCategory(b, category)
        );
    };

    const getImpactedAliasesForCategory = (category: string) => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const matchingBreaches = new Set(
            getBreachesForCategory(category).map((b: any) => b.Name)
        );
        const impacted: string[] = [];
        Object.entries(domainResults.aliases).forEach(([alias, breaches]) => {
            if (breaches.some(bName => matchingBreaches.has(bName))) {
                impacted.push(alias);
            }
        });
        return impacted;
    };

    // --- Data Aggregation Helpers for Domain Search ---

    const getBreachCounts = () => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const counts: Record<string, number> = {};
        Object.values(domainResults.aliases).forEach(breaches => {
            breaches.forEach(b => {
                counts[b] = (counts[b] || 0) + 1;
            });
        });

        const mapped = Object.entries(counts).map(([name, count]) => ({
            name,
            count,
            date: allBreachesMeta[name]?.BreachDate || "Unknown",
        }));

        return mapped.sort((a, b) => {
            if (sortConfig.key === 'count') {
                return sortConfig.desc ? b.count - a.count : a.count - b.count;
            } else {
                const fA = a.date === "Unknown" ? "" : a.date;
                const fB = b.date === "Unknown" ? "" : b.date;
                return sortConfig.desc ? fB.localeCompare(fA) : fA.localeCompare(fB);
            }
        });
    };

    const handleSort = (key: 'count' | 'date') => {
        if (sortConfig.key === key) {
            setSortConfig({ key, desc: !sortConfig.desc });
        } else {
            setSortConfig({ key, desc: true });
        }
    };

    const triggerBreachView = async (viewType: "details" | "impacted") => {
        setBreachSearchError("");
        if (!allBreachesMeta[breachSearchQuery]) {
            setBreachSearchError("Breach not found. Please ensure the exact name is selected from the dropdown.");
            setBreachSearchView(null);
            return;
        }

        setBreachSearchView(viewType);

        if (viewType === 'impacted' && !domainResults) {
            setBreachSearchLoading(true);
            await fetchDomainData();
            setBreachSearchLoading(false);
        }
    };

    const triggerCategoryView = async (viewType: "breaches" | "impacted") => {
        setCategorySearchView(viewType);
        if (viewType === 'impacted' && !domainResults) {
            setBreachSearchLoading(true);
            await fetchDomainData();
            setBreachSearchLoading(false);
        }
    };

    const getImpactedAliasesForBreach = () => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const impacted: string[] = [];
        Object.entries(domainResults.aliases).forEach(([alias, breaches]) => {
            if (breaches.includes(breachSearchQuery)) {
                impacted.push(alias);
            }
        });
        return impacted;
    };

    const getTopAliases = (limit: number) => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const mapped = Object.entries(domainResults.aliases).map(([alias, breaches]) => ({
            alias,
            count: breaches.length
        }));
        return mapped.sort((a, b) => b.count - a.count).slice(0, limit);
    };

    const downloadCSV = (filterBreach?: string) => {
        if (!domainResults) return;
        
        const headers = ["Email", "AD Name", "AD Status", "Locked", "Title", "Department", "Description", "Password Last Set", "Breach Count", "Breaches"];
        const rows = Object.entries(domainResults.aliases)
            .filter(([_, breaches]) => !filterBreach || breaches.includes(filterBreach))
            .map(([alias, breaches]) => {
                const email = `${alias}@${domainStr}`.toLowerCase();
                const ad = domainResults.adEnrichment[email] || {};
                return [
                    email,
                    ad.displayName || "N/A",
                    ad.email ? (ad.enabled ? "Active" : "Disabled") : "Not in AD",
                    ad.email ? (ad.locked ? "Locked" : "Unlocked") : "N/A",
                    ad.title || "N/A",
                    ad.department || "N/A",
                    ad.description || "N/A",
                    ad.pwdLastSet || "N/A",
                    breaches.length,
                    breaches.join("; ")
                ];
            });

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const filename = filterBreach 
            ? `hibp_breach_${filterBreach.replace(/\s+/g, '_')}_${domainStr}_${new Date().toISOString().split('T')[0]}.csv`
            : `hibp_domain_report_${domainStr}_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatFirstLast = (adName?: string, fallbackAlias?: string) => {
        if (!adName || adName === "N/A") {
            return fallbackAlias || "N/A";
        }
        if (adName.includes(",")) {
            const parts = adName.split(",");
            const last = parts[0].trim();
            const first = parts.slice(1).join(",").trim();
            return `${first} ${last}`.trim();
        }
        return adName.trim();
    };

    const stripHtml = (html?: string) => {
        if (!html) return "";
        return html
            .replace(/<[^>]*>/g, "")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim();
    };

    const exportMailMergeCSV = ({
        breachName,
        categoryName,
        activeOnly,
    }: {
        breachName?: string;
        categoryName?: string;
        activeOnly: boolean;
    }) => {
        if (!domainResults) return;

        const isSingleBreach = !!breachName;
        const isCategory = !!categoryName && !isSingleBreach;
        const matchingCatBreaches = isCategory ? new Set(getBreachesForCategory(categoryName!).map((b: any) => b.Name)) : null;

        const breachMeta = isSingleBreach ? allBreachesMeta[breachName!] || {} : null;
        const breachTitle = breachMeta?.Title || breachName || (isCategory ? `Category: ${categoryName}` : "Multiple Breaches");
        const breachDate = breachMeta?.BreachDate || (isCategory ? "Various" : "Various");
        const breachDetails = breachMeta ? stripHtml(breachMeta.Description) || "N/A" : (isCategory ? `Impacted by data breaches leaking ${categoryName}` : "Multiple organizational domain breaches");

        // Headers formatted specifically for Outlook Mail Merge:
        const headers = [
            "Email",
            "Name",
            "AD Name",
            "Account Status",
            "Breach Name",
            "Breach Details",
            "Date of Breach",
        ];

        const rows = Object.entries(domainResults.aliases)
            .filter(([_, breaches]) => {
                if (isSingleBreach) return breaches.includes(breachName!);
                if (isCategory) return breaches.some(b => matchingCatBreaches!.has(b));
                return true;
            })
            .filter(([alias]) => {
                if (!activeOnly) return true;
                const email = `${alias}@${domainStr}`.toLowerCase();
                const ad = domainResults.adEnrichment[email];
                return ad && ad.enabled;
            })
            .map(([alias, breaches]) => {
                const email = `${alias}@${domainStr}`.toLowerCase();
                const ad = domainResults.adEnrichment[email] || {};
                const rawName = ad.displayName || "";
                const firstLastName = formatFirstLast(rawName, alias);
                const status = ad.email ? (ad.enabled ? "Active" : "Disabled") : "Not in AD";
                const relevantBreaches = isCategory ? breaches.filter(b => matchingCatBreaches!.has(b)) : breaches;

                return [
                    email,
                    firstLastName || "N/A",
                    rawName || "N/A",
                    status,
                    isSingleBreach ? breachTitle : relevantBreaches.join("; "),
                    breachDetails,
                    isSingleBreach ? breachDate : "Various",
                ];
            });

        const csvContent = [headers, ...rows]
            .map((row) =>
                row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
            )
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);

        const scopeLabel = activeOnly ? "active_accounts" : "all_accounts";
        let prefix = "domain_all";
        if (isSingleBreach) prefix = breachName!.replace(/[^a-zA-Z0-9_-]/g, "_");
        else if (isCategory) prefix = `category_${categoryName!.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

        const filename = `mail_merge_${prefix}_${scopeLabel}_${domainStr}_${new Date().toISOString().split("T")[0]}.csv`;

        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const ExportDropdown = ({
        breachName,
        categoryName,
        activeCount,
        totalCount,
        label = "Export CSV",
    }: {
        breachName?: string;
        categoryName?: string;
        activeCount?: number;
        totalCount?: number;
        label?: string;
    }) => {
        const [isOpen, setIsOpen] = useState(false);
        const dropdownRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const handleClickOutside = (e: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                    setIsOpen(false);
                }
            };
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === "Escape") setIsOpen(false);
            };
            if (isOpen) {
                document.addEventListener("mousedown", handleClickOutside);
                document.addEventListener("keydown", handleKeyDown);
            }
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
                document.removeEventListener("keydown", handleKeyDown);
            };
        }, [isOpen]);

        return (
            <div className="relative inline-block" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="btn-primary inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-all"
                >
                    <Download size={14} />
                    <span>{label}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                    <div 
                        className="absolute right-0 top-full mt-2 w-72 bg-bg-surface border border-border-color rounded-xl shadow-2xl z-50 p-1.5 flex flex-col gap-1"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--border-color)" }}
                    >
                        <div className="px-3 py-1.5 text-[0.7rem] font-bold text-text-muted uppercase tracking-wider border-b border-border-color/60">
                            Select Export Format
                        </div>

                        {/* Option 1: Active Accounts Mail Merge */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                exportMailMergeCSV({ breachName, categoryName, activeOnly: true });
                            }}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-emerald-500/10 text-left border-none bg-transparent cursor-pointer transition-colors group"
                        >
                            <UserCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="text-xs font-bold text-text-primary group-hover:text-emerald-300 flex items-center justify-between">
                                    <span>Active Accounts (Mail Merge)</span>
                                    {typeof activeCount === "number" && (
                                        <span className="text-[0.65rem] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                                            {activeCount}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[0.7rem] text-text-muted mt-0.5 m-0 leading-tight">
                                    Only active AD accounts • Formatted with First Last names for Outlook
                                </p>
                            </div>
                        </button>

                        {/* Option 2: All Accounts Mail Merge */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                exportMailMergeCSV({ breachName, categoryName, activeOnly: false });
                            }}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-accent-primary/10 text-left border-none bg-transparent cursor-pointer transition-colors group"
                        >
                            <Users size={16} className="text-accent-primary shrink-0 mt-0.5" />
                            <div>
                                <div className="text-xs font-bold text-text-primary group-hover:text-accent-primary flex items-center justify-between">
                                    <span>All Accounts (Mail Merge)</span>
                                    {typeof totalCount === "number" && (
                                        <span className="text-[0.65rem] px-1.5 py-0.2 rounded bg-accent-primary/20 text-accent-primary font-mono">
                                            {totalCount}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[0.7rem] text-text-muted mt-0.5 m-0 leading-tight">
                                    All accounts (Active & Inactive) • Formatted with First Last names
                                </p>
                            </div>
                        </button>

                        <div className="border-t border-border-color/60 my-0.5" />

                        {/* Option 3: Full Diagnostic CSV */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                downloadCSV(breachName);
                            }}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-bg-surface-hover text-left border-none bg-transparent cursor-pointer transition-colors group"
                        >
                            <FileSpreadsheet size={16} className="text-text-muted shrink-0 mt-0.5" />
                            <div>
                                <div className="text-xs font-bold text-text-primary group-hover:text-text-primary">
                                    Full Diagnostic CSV
                                </div>
                                <p className="text-[0.7rem] text-text-muted mt-0.5 m-0 leading-tight">
                                    Complete raw AD fields & full breach history
                                </p>
                            </div>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const EmailRecord = ({ alias, breachList }: { alias: string, breachList: string[] }) => {
        const email = `${alias}@${domainStr}`.toLowerCase();
        const ad = domainResults?.adEnrichment[email];
        const isExpanded = expandedAlias === alias;
        
        let borderStyle = '1px solid var(--border-color)';
        let bgStyle = 'var(--bg-dark)';
        if (ad) {
            borderStyle = ad.enabled ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid rgba(239, 68, 68, 0.5)';
            bgStyle = ad.enabled ? 'rgba(234, 179, 8, 0.05)' : 'rgba(239, 68, 68, 0.05)';
        }

        const hasAnyPasswordBreach = breachList.some((bName: string) => {
            const meta = allBreachesMeta[bName];
            return meta && breachHasPassword(meta);
        });

        return (
            <div 
                onClick={() => setExpandedAlias(isExpanded ? null : alias)}
                style={{ 
                    background: bgStyle, 
                    padding: '1rem', 
                    borderRadius: 'var(--radius-sm)', 
                    border: borderStyle,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-wrap">
                        <strong style={{ fontSize: '1.1rem', color: ad ? (ad.enabled ? '#eab308' : '#f87171') : 'var(--text-primary)' }}>
                            {alias}@{domainStr}
                            {ad && (
                                <span style={{ fontSize: '0.7rem', marginLeft: '10px', padding: '2px 8px', borderRadius: '4px', background: ad.enabled ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)', color: ad.enabled ? '#fde047' : '#fca5a5', textTransform: 'uppercase', verticalAlign: 'middle' }}>
                                    {ad.enabled ? 'Active' : 'Disabled'} {ad.locked ? '(Locked)' : ''}
                                </span>
                            )}
                        </strong>
                        {hasAnyPasswordBreach && (
                            <span 
                                title="This user has accounts exposed in breaches containing passwords!"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[0.7rem] font-bold"
                            >
                                <AlertTriangle size={12} className="text-rose-400 fill-rose-500/20" />
                                <span>Password Exposed</span>
                            </span>
                        )}
                    </div>
                    <div className="text-text-muted">{isExpanded ? '▲' : '▼'}</div>
                </div>

                {!isExpanded && (
                    <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '10px' }}>
                        {breachList.map((breachName: string) => {
                            const meta = allBreachesMeta[breachName];
                            const hasPwd = meta && breachHasPassword(meta);
                            return (
                                <span 
                                    key={breachName} 
                                    style={{ 
                                        background: hasPwd ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)', 
                                        border: hasPwd ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent',
                                        padding: '2px 8px', 
                                        borderRadius: '4px', 
                                        color: hasPwd ? '#fca5a5' : 'var(--text-secondary)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontWeight: hasPwd ? 600 : 400
                                    }}
                                >
                                    {hasPwd && <AlertTriangle size={11} className="text-rose-400" />}
                                    {breachName}
                                </span>
                            );
                        })}
                    </div>
                )}

                {isExpanded && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Active Directory Identity</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Name:</strong> {ad?.displayName || "N/A"}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Title:</strong> {ad?.title || "N/A"}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Dept:</strong> {ad?.department || "N/A"}</p>
                        </div>
                        <div>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Account Status</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Enabled:</strong> {ad ? (ad.enabled ? 'Yes' : 'No') : 'N/A'}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Locked:</strong> {ad ? (ad.locked ? 'Yes' : 'No') : 'N/A'}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Pwd Last Set:</strong> {ad?.pwdLastSet || "N/A"}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Description</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{ad?.description || "No description provided."}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Breach History</h5>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {breachList.map((breachName: string) => {
                                    const meta = allBreachesMeta[breachName];
                                    const hasPwd = meta && breachHasPassword(meta);
                                    return (
                                        <span 
                                            key={breachName} 
                                            style={{ 
                                                background: hasPwd ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)', 
                                                border: hasPwd ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent',
                                                padding: '4px 10px', 
                                                borderRadius: '12px', 
                                                color: hasPwd ? '#fca5a5' : 'var(--text-secondary)',
                                                fontSize: '0.75rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontWeight: hasPwd ? 700 : 500
                                            }}
                                        >
                                            {hasPwd && <AlertTriangle size={12} className="text-rose-400" />}
                                            <span>{breachName}</span>
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="internal-scroll-layout">
            <QueryHeader
                title="HIBP Domain Security"
                description="Check if your verified organizational domains have been impacted by specific data breaches or compromised data classes (e.g. passwords). Search results are enriched with Active Directory status:"
                toolId="hibp-domain"
                icon={<ShieldCheck />}
                actions={
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span className="flex items-center gap-2">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 10px rgba(234, 179, 8, 0.4)' }}></span> 
                            Active Account
                        </span>
                        <span className="flex items-center gap-2">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f87171', boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)' }}></span> 
                            Disabled Account
                        </span>
                    </div>
                }
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '1rem' }}>
                
                {/* Tab Switcher */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                    <button 
                        onClick={() => setActiveTab("domain")}
                        style={{ 
                            padding: '12px 24px', 
                            background: 'transparent', 
                            color: activeTab === 'domain' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            border: 'none',
                            borderBottom: activeTab === 'domain' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Domain Breach Check
                    </button>
                    <button 
                        onClick={() => setActiveTab("breach")}
                        style={{ 
                            padding: '12px 24px', 
                            background: 'transparent', 
                            color: activeTab === 'breach' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            border: 'none',
                            borderBottom: activeTab === 'breach' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Breach & Category Search
                    </button>
                </div>

                {activeTab === 'domain' && (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2rem', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>

                        {/* --- DOMAIN SEARCH CARD --- */}
                        <div className="glass-card flex flex-col">
                            <div style={{ flexShrink: 0 }}>
                                <h3 className="mb-4">Domain Breach Check</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    Retrieves compromised email aliases for verified domains on your HIBP account.
                                </p>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <div className="input-group">
                                        <label htmlFor="domainStr">Verified Domain</label>
                                        {availableDomains.length === 0 ? (
                                            <input type="text" disabled placeholder="Fetching verified domains..." />
                                        ) : (
                                            <select
                                                id="domainStr"
                                                value={domainStr}
                                                onChange={(e) => {
                                                    setDomainStr(e.target.value);
                                                    setDomainResults(null);
                                                    setActiveView(null);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '1rem',
                                                    transition: 'all 0.2s ease',
                                                    outline: 'none',
                                                }}
                                            >
                                                {availableDomains.map(d => (
                                                    <option key={d.DomainName} value={d.DomainName} className="bg-bg-dark">
                                                        {d.DomainName}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '2rem' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: activeView === 'all' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: activeView === 'all' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: activeView === 'all' ? '#fff' : 'var(--text-secondary)',
                                            padding: '8px 4px', fontSize: '0.8rem'
                                        }}
                                        onClick={() => triggerView("all")}
                                        disabled={domainLoading || availableDomains.length === 0}
                                    >
                                        {domainLoading && activeView === 'all' ? "Loading..." : "All Impacted Emails"}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: activeView === 'breaches' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: activeView === 'breaches' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: activeView === 'breaches' ? '#fff' : 'var(--text-secondary)',
                                            padding: '8px 4px', fontSize: '0.8rem'
                                        }}
                                        onClick={() => triggerView("breaches")}
                                        disabled={domainLoading || availableDomains.length === 0}
                                    >
                                        {domainLoading && activeView === 'breaches' ? "Loading..." : "View Domain Breaches"}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: activeView === 'summary' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: activeView === 'summary' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: activeView === 'summary' ? '#fff' : 'var(--text-secondary)',
                                            padding: '8px 4px', fontSize: '0.8rem'
                                        }}
                                        onClick={() => triggerView("summary")}
                                        disabled={domainLoading || availableDomains.length === 0}
                                    >
                                        {domainLoading && activeView === 'summary' ? "Loading..." : "Executive Summary"}
                                    </button>
                                </div>
                            </div>

                            {domainError && (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                                    <strong>Error:</strong> {domainError}
                                </div>
                            )}

                            {domainResults && activeView && (
                                <div style={{ marginTop: '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {!domainResults.hasBreaches ? (
                                        <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                            <strong>Clean!</strong> No known breaches found for any email addresses on {domainStr}.
                                        </div>
                                    ) : (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

                                            {/* VIEW 1: All Aliases */}
                                            {activeView === 'all' && (
                                                <>
                                                    <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong>{Object.keys(domainResults.aliases).length} Impacted Email Aliases Found</strong>
                                                        <ExportDropdown
                                                            totalCount={Object.keys(domainResults.aliases).length}
                                                            label="Export Report"
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                        {Object.entries(domainResults.aliases).map(([alias, breachList]: [string, any]) => (
                                                            <EmailRecord key={alias} alias={alias} breachList={breachList} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            {/* VIEW 2: Unique Domain Breaches */}
                                            {activeView === 'breaches' && (
                                                <>
                                                    <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8', borderRadius: 'var(--radius-md)', border: '1px solid #38bdf8', marginBottom: '1rem' }}>
                                                        <strong>{getBreachCounts().length} Unique Breaches Affecting {domainStr}</strong>
                                                    </div>
                                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                                            <thead className="sticky-header">
                                                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface-hover)' }}>
                                                                    <th style={{ padding: '12px 16px' }}>Breach Name</th>
                                                                    <th
                                                                        style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                                                                        onClick={() => handleSort('date')}
                                                                    >
                                                                        Date {sortConfig.key === 'date' ? (sortConfig.desc ? '↓' : '↑') : ''}
                                                                    </th>
                                                                    <th
                                                                        style={{ padding: '12px 16px', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                                                                        onClick={() => handleSort('count')}
                                                                    >
                                                                        Impacted Emails {sortConfig.key === 'count' ? (sortConfig.desc ? '↓' : '↑') : ''}
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {getBreachCounts().map((b) => {
                                                                    const meta = allBreachesMeta[b.name];
                                                                    const hasPwd = meta && breachHasPassword(meta);
                                                                    return (
                                                                        <tr key={b.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    <span>{b.name}</span>
                                                                                    {hasPwd && (
                                                                                        <span 
                                                                                            title="⚠️ Critical: This breach exposed user passwords!"
                                                                                            style={{
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '4px',
                                                                                                padding: '2px 6px',
                                                                                                borderRadius: '4px',
                                                                                                background: 'rgba(239, 68, 68, 0.15)',
                                                                                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                                                                                color: '#f87171',
                                                                                                fontSize: '0.7rem',
                                                                                                fontWeight: 700
                                                                                            }}
                                                                                        >
                                                                                            <AlertTriangle size={11} className="text-rose-400 fill-rose-500/20" />
                                                                                            <span>Passwords</span>
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{b.date}</td>
                                                                            <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                                                    <span style={{ background: 'rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '12px', color: '#fca5a5', fontSize: '0.85rem' }}>
                                                                                        {b.count}
                                                                                    </span>
                                                                                    <ExportDropdown
                                                                                        breachName={b.name}
                                                                                        label="Export"
                                                                                    />
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            )}

                                            {/* VIEW 3: Executive Summary */}
                                            {activeView === 'summary' && (
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto', paddingRight: '8px' }}>
                                                    <div>
                                                        <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>Top 10 Worst Breaches</h4>
                                                        <div className="grid gap-2">
                                                            {getBreachCounts().slice(0, 10).map((b, idx) => {
                                                                const meta = allBreachesMeta[b.name];
                                                                const hasPwd = meta && breachHasPassword(meta);
                                                                return (
                                                                    <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                                        <span className="text-text-secondary flex items-center gap-2">
                                                                            <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>#{idx + 1}</span>
                                                                            <span>{b.name}</span> 
                                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({b.date})</span>
                                                                            {hasPwd && (
                                                                                <span title="Exposed Passwords">
                                                                                    <AlertTriangle size={13} className="text-rose-400 fill-rose-500/20 ml-1" />
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                        <span style={{ fontWeight: 600, color: '#fca5a5' }}>{b.count} org accounts</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            Top 25 Most Compromised Aliases
                                                            <ExportDropdown
                                                                totalCount={Object.keys(domainResults.aliases).length}
                                                                label="Export Full Report"
                                                            />
                                                        </h4>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}>
                                                            {getTopAliases(25).map((aliasObj, idx) => {
                                                                const email = `${aliasObj.alias}@${domainStr}`.toLowerCase();
                                                                const ad = domainResults.adEnrichment[email];
                                                                
                                                                let bg = 'var(--bg-surface-hover)';
                                                                let color = 'var(--text-primary)';
                                                                if (ad) {
                                                                    bg = ad.enabled ? 'rgba(234, 179, 8, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                                                    color = ad.enabled ? '#eab308' : '#f87171';
                                                                }

                                                                return (
                                                                    <div key={aliasObj.alias} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                                        <span style={{ color: color, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            {aliasObj.alias}@{domainStr}
                                                                            {ad && <span style={{ fontSize: '0.65rem', marginLeft: '8px', opacity: 0.8 }}>({ad.enabled ? 'Active' : 'Disabled'})</span>}
                                                                        </span>
                                                                        <span style={{ background: 'var(--bg-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#fca5a5', whiteSpace: 'nowrap' }}>
                                                                            In {aliasObj.count} breaches
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'breach' && (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2rem', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                        {/* --- BREACH & CATEGORY SEARCH CARD --- */}
                        <div className="glass-card flex flex-col">
                            <div style={{ flexShrink: 0 }}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                    <h3 className="m-0">Breach & Category Search</h3>
                                    
                                    {/* Search Mode Pill Switcher */}
                                    <div className="flex p-1 bg-bg-dark border border-border-color rounded-xl shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchMode("breachName");
                                                setCategorySearchView(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer ${
                                                searchMode === "breachName"
                                                    ? "bg-accent-primary text-white shadow-sm"
                                                    : "bg-transparent text-text-muted hover:text-text-primary"
                                            }`}
                                        >
                                            Breach Name
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchMode("dataCategory");
                                                setBreachSearchView(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                                                searchMode === "dataCategory"
                                                    ? "bg-accent-primary text-white shadow-sm"
                                                    : "bg-transparent text-text-muted hover:text-text-primary"
                                            }`}
                                        >
                                            <span>Data Category</span>
                                            {selectedCategory.toLowerCase().includes("password") && (
                                                <AlertTriangle size={12} className="text-rose-300 fill-rose-500/20" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    {searchMode === "breachName" 
                                        ? "Search for a specific data breach by name to see its details and find out if your domain was impacted."
                                        : "Search by compromised data category (e.g. Passwords, Credit cards, SSNs) to see all matching breaches and impacted employees on your domain."}
                                </p>

                                {/* MODE 1: BREACH NAME SEARCH */}
                                {searchMode === "breachName" && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div className="input-group">
                                            <label htmlFor="breachSearchQuery">Breach Name</label>
                                            <input
                                                type="text"
                                                id="breachSearchQuery"
                                                list="breachNamesList"
                                                value={breachSearchQuery}
                                                onChange={(e) => {
                                                    setBreachSearchQuery(e.target.value);
                                                    setBreachSearchView(null);
                                                    setBreachSearchError("");
                                                }}
                                                placeholder="e.g. LinkedIn, Adobe, Dropbox..."
                                                disabled={Object.keys(allBreachesMeta).length === 0}
                                            />
                                            <datalist id="breachNamesList">
                                                {Object.keys(allBreachesMeta).map(name => (
                                                    <option key={name} value={name} />
                                                ))}
                                            </datalist>
                                        </div>

                                        <div className="input-group">
                                            <label htmlFor="breachDomainStr">Target Domain (for Impacted Emails)</label>
                                            {availableDomains.length === 0 ? (
                                                <input type="text" disabled placeholder="Fetching verified domains..." />
                                            ) : (
                                                <select
                                                    id="breachDomainStr"
                                                    value={domainStr}
                                                    onChange={(e) => {
                                                        setDomainStr(e.target.value);
                                                        setDomainResults(null);
                                                        setActiveView(null);
                                                        setBreachSearchView(null);
                                                    }}
                                                    style={{
                                                        width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                                        color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                                                    }}
                                                >
                                                    {availableDomains.map(d => (
                                                        <option key={d.DomainName} value={d.DomainName} className="bg-bg-dark">{d.DomainName}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '0.5rem' }}>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                style={{
                                                    background: breachSearchView === 'details' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                                    borderColor: breachSearchView === 'details' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                                    color: breachSearchView === 'details' ? '#fff' : 'var(--text-secondary)'
                                                }}
                                                onClick={() => triggerBreachView("details")}
                                                disabled={!breachSearchQuery || Object.keys(allBreachesMeta).length === 0}
                                            >
                                                Breach Details
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                style={{
                                                    background: breachSearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                                    borderColor: breachSearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                                    color: breachSearchView === 'impacted' ? '#fff' : 'var(--text-secondary)'
                                                }}
                                                onClick={() => triggerBreachView("impacted")}
                                                disabled={!breachSearchQuery || Object.keys(allBreachesMeta).length === 0 || breachSearchLoading}
                                            >
                                                {breachSearchLoading && breachSearchView === 'impacted' ? 'Loading...' : 'Details & Impacted Emails'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* MODE 2: COMPROMISED DATA CATEGORY SEARCH */}
                                {searchMode === "dataCategory" && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div className="input-group">
                                            <label htmlFor="selectedCategory" className="flex items-center justify-between">
                                                <span>Compromised Data Category</span>
                                                {selectedCategory.toLowerCase().includes("password") && (
                                                    <span className="text-rose-400 text-xs font-bold flex items-center gap-1">
                                                        <AlertTriangle size={13} className="fill-rose-500/20" />
                                                        High Risk Category
                                                    </span>
                                                )}
                                            </label>
                                            <select
                                                id="selectedCategory"
                                                value={selectedCategory}
                                                onChange={(e) => {
                                                    setSelectedCategory(e.target.value);
                                                    setCategorySearchView(null);
                                                }}
                                                style={{
                                                    width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                    border: selectedCategory.toLowerCase().includes("password") ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--border-color)', 
                                                    borderRadius: 'var(--radius-sm)',
                                                    color: selectedCategory.toLowerCase().includes("password") ? '#fca5a5' : 'var(--text-primary)', 
                                                    fontSize: '1rem', outline: 'none', fontWeight: 600
                                                }}
                                            >
                                                {allDataClasses.map((cat) => (
                                                    <option key={cat} value={cat} className="bg-bg-dark">
                                                        {cat.toLowerCase().includes("password") ? `⚠️ ${cat} (High Risk)` : cat}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="input-group">
                                            <label htmlFor="categoryDomainStr">Target Domain (for Impacted Emails)</label>
                                            <select
                                                id="categoryDomainStr"
                                                value={domainStr}
                                                onChange={(e) => {
                                                    setDomainStr(e.target.value);
                                                    setDomainResults(null);
                                                    setActiveView(null);
                                                    setCategorySearchView(null);
                                                }}
                                                style={{
                                                    width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                                                }}
                                            >
                                                {availableDomains.map(d => (
                                                    <option key={d.DomainName} value={d.DomainName} className="bg-bg-dark">{d.DomainName}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '0.5rem' }}>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                style={{
                                                    background: categorySearchView === 'breaches' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                                    borderColor: categorySearchView === 'breaches' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                                    color: categorySearchView === 'breaches' ? '#fff' : 'var(--text-secondary)'
                                                }}
                                                onClick={() => triggerCategoryView("breaches")}
                                            >
                                                Matching Breaches ({getBreachesForCategory(selectedCategory).length})
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                style={{
                                                    background: categorySearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                                    borderColor: categorySearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                                    color: categorySearchView === 'impacted' ? '#fff' : 'var(--text-secondary)'
                                                }}
                                                onClick={() => triggerCategoryView("impacted")}
                                                disabled={breachSearchLoading}
                                            >
                                                {breachSearchLoading && categorySearchView === 'impacted' ? 'Loading...' : `Impacted Emails (${selectedCategory})`}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {breachSearchError && (
                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                    <strong>Error:</strong> {breachSearchError}
                                </div>
                            )}

                            {/* RESULT CONTAINER FOR SEARCH BY BREACH NAME */}
                            {searchMode === "breachName" && breachSearchView && allBreachesMeta[breachSearchQuery] && (
                                <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {(() => {
                                        const breach = allBreachesMeta[breachSearchQuery];
                                        const hasPassword = breachHasPassword(breach);

                                        return (
                                            <div style={{ flexShrink: 0, background: 'var(--bg-dark)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: hasPassword ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border-color)', marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                    <div>
                                                        <div className="flex items-center gap-2.5 flex-wrap">
                                                            <h4 style={{ color: 'var(--accent-primary)', fontSize: '1.3rem', margin: 0 }}>{breach.Title}</h4>
                                                            {hasPassword && (
                                                                <span 
                                                                    title="⚠️ Critical: This breach exposed user passwords!"
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50 text-xs font-extrabold shadow-sm"
                                                                >
                                                                    <AlertTriangle size={13} className="text-rose-400 fill-rose-500/20" />
                                                                    <span>Passwords Exposed</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                                                            Breached: <strong>{breach.BreachDate}</strong>
                                                        </span>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fca5a5' }}>{breach.PwnCount.toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Accounts Compromised Globally</div>
                                                    </div>
                                                </div>

                                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: breach.Description }}></p>

                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>Compromised Data Classes:</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {breach.DataClasses.map((dc: string) => {
                                                        const isPwd = dc.toLowerCase().includes("password");
                                                        return (
                                                            <span 
                                                                key={dc} 
                                                                style={{ 
                                                                    background: isPwd ? 'rgba(239, 68, 68, 0.25)' : 'var(--bg-surface-hover)', 
                                                                    border: isPwd ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--border-color)',
                                                                    color: isPwd ? '#fca5a5' : 'var(--text-muted)', 
                                                                    fontWeight: isPwd ? 800 : 500,
                                                                    padding: '4px 10px', 
                                                                    borderRadius: '12px', 
                                                                    fontSize: '0.75rem',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    boxShadow: isPwd ? '0 0 10px rgba(239, 68, 68, 0.25)' : 'none'
                                                                }}
                                                            >
                                                                {isPwd && <AlertTriangle size={12} className="text-rose-400" />}
                                                                <span>{dc}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {breachSearchView === 'impacted' && (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                            <h4 style={{ flexShrink: 0, color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                Impacted Emails on {domainStr}
                                            </h4>

                                            {domainError && (
                                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                                                    <strong>Domain Error:</strong> {domainError}
                                                </div>
                                            )}

                                            {domainResults && (
                                                getImpactedAliasesForBreach().length === 0 ? (
                                                    <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                                        <strong>Clear!</strong> No emails on {domainStr} were found in this specific breach.
                                                    </div>
                                                ) : (
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                                        {(() => {
                                                            const impacted = getImpactedAliasesForBreach();
                                                            const activeCount = impacted.filter(alias => {
                                                                const email = `${alias}@${domainStr}`.toLowerCase();
                                                                const ad = domainResults?.adEnrichment[email];
                                                                return ad && ad.enabled;
                                                            }).length;

                                                            return (
                                                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                                                    <div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <strong style={{ color: '#f87171', fontSize: '1rem' }}>
                                                                                {impacted.length} Impacted {impacted.length === 1 ? 'Account' : 'Accounts'} on {domainStr}
                                                                            </strong>
                                                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontWeight: 700 }}>
                                                                                {activeCount} Active
                                                                            </span>
                                                                            {impacted.length - activeCount > 0 && (
                                                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 700 }}>
                                                                                    {impacted.length - activeCount} Inactive / External
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                                                            Select an Outlook Mail Merge format or full diagnostic export below.
                                                                        </p>
                                                                    </div>

                                                                    <ExportDropdown
                                                                        breachName={breachSearchQuery}
                                                                        activeCount={activeCount}
                                                                        totalCount={impacted.length}
                                                                        label="Export Breach Report"
                                                                    />
                                                                </div>
                                                            );
                                                        })()}
                                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', overflowY: 'auto' }}>
                                                            {getImpactedAliasesForBreach().map(alias => (
                                                                <EmailRecord key={alias} alias={alias} breachList={domainResults.aliases[alias]} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* RESULT CONTAINER FOR SEARCH BY DATA CATEGORY */}
                            {searchMode === "dataCategory" && categorySearchView && (
                                <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {/* Category Info Header Banner */}
                                    <div style={{ flexShrink: 0, background: selectedCategory.toLowerCase().includes("password") ? 'rgba(239,68,68,0.1)' : 'var(--bg-dark)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', border: selectedCategory.toLowerCase().includes("password") ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border-color)', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                            <div className="flex items-center gap-2">
                                                {selectedCategory.toLowerCase().includes("password") ? (
                                                    <AlertTriangle size={20} className="text-rose-400 fill-rose-500/20" />
                                                ) : (
                                                    <Layers size={20} className="text-accent-primary" />
                                                )}
                                                <div>
                                                    <strong style={{ fontSize: '1.1rem', color: selectedCategory.toLowerCase().includes("password") ? '#f87171' : 'var(--text-primary)' }}>
                                                        Category: {selectedCategory}
                                                    </strong>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                                                        ({getBreachesForCategory(selectedCategory).length} total breaches compromise this data class)
                                                    </span>
                                                </div>
                                            </div>

                                            {categorySearchView === 'impacted' && domainResults && (
                                                <ExportDropdown
                                                    categoryName={selectedCategory}
                                                    activeCount={getImpactedAliasesForCategory(selectedCategory).filter(alias => {
                                                        const email = `${alias}@${domainStr}`.toLowerCase();
                                                        return domainResults.adEnrichment[email]?.enabled;
                                                    }).length}
                                                    totalCount={getImpactedAliasesForCategory(selectedCategory).length}
                                                    label={`Export ${selectedCategory} Report`}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* View Mode A: Matching Breaches in this Category */}
                                    {categorySearchView === 'breaches' && (
                                        <div style={{ flex: 1, overflowY: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                                <thead className="sticky-header">
                                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface-hover)' }}>
                                                        <th style={{ padding: '12px 16px' }}>Breach Name</th>
                                                        <th style={{ padding: '12px 16px' }}>Breach Date</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Compromised Accounts</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {getBreachesForCategory(selectedCategory).map((b: any) => {
                                                        const hasPwd = breachHasPassword(b);
                                                        return (
                                                            <tr key={b.Name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                                <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>
                                                                    <div className="flex items-center gap-2">
                                                                        <span>{b.Title || b.Name}</span>
                                                                        {hasPwd && (
                                                                            <span 
                                                                                title="⚠️ This breach exposed user passwords!"
                                                                                style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    padding: '2px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                                                                    color: '#f87171',
                                                                                    fontSize: '0.7rem',
                                                                                    fontWeight: 700
                                                                                }}
                                                                            >
                                                                                <AlertTriangle size={11} className="text-rose-400 fill-rose-500/20" />
                                                                                <span>Passwords</span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{b.BreachDate}</td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fca5a5', fontWeight: 600 }}>
                                                                    {b.PwnCount.toLocaleString()}
                                                                </td>
                                                                <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSearchMode("breachName");
                                                                            setBreachSearchQuery(b.Name);
                                                                            triggerBreachView("impacted");
                                                                        }}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                                    >
                                                                        Check Domain Impact
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* View Mode B: Impacted Emails in this Category */}
                                    {categorySearchView === 'impacted' && (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                            {domainError && (
                                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                                                    <strong>Domain Error:</strong> {domainError}
                                                </div>
                                            )}

                                            {domainResults && (
                                                getImpactedAliasesForCategory(selectedCategory).length === 0 ? (
                                                    <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                                        <strong>Clear!</strong> No emails on {domainStr} were impacted by breaches leaking {selectedCategory}.
                                                    </div>
                                                ) : (
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                                        <div style={{ flexShrink: 0, padding: '0.75rem 1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <strong>{getImpactedAliasesForCategory(selectedCategory).length} Accounts Impacted by {selectedCategory} Exposure</strong>
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {getImpactedAliasesForCategory(selectedCategory).filter(alias => {
                                                                    const email = `${alias}@${domainStr}`.toLowerCase();
                                                                    return domainResults.adEnrichment[email]?.enabled;
                                                                }).length} Active Accounts
                                                            </span>
                                                        </div>
                                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', overflowY: 'auto' }}>
                                                            {getImpactedAliasesForCategory(selectedCategory).map(alias => (
                                                                <EmailRecord key={alias} alias={alias} breachList={domainResults.aliases[alias]} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
