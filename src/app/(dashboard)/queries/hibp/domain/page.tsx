"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { 
    ShieldCheck, Download, Mail, UserCheck, Users, 
    FileSpreadsheet, ChevronDown, AlertTriangle, KeyRound, 
    Filter, Database, Layers, CheckCircle2, X, Plus, Sparkles, CreditCard, IdCard
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";

// High-Risk Data Categories for visual flags and quick filters
const HIGH_RISK_DATA_CLASSES: Record<string, { type: string; label: string; icon: string; badge: string; border: string }> = {
    // 1. Credentials & Authentication (Red / Rose)
    "Passwords": { type: "credential", label: "Passwords", icon: "⚠️", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },
    "Password hints": { type: "credential", label: "Password hints", icon: "⚠️", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },
    "Historical passwords": { type: "credential", label: "Historical passwords", icon: "⚠️", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },
    "Auth tokens": { type: "credential", label: "Auth tokens", icon: "🔑", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },
    "PINs": { type: "credential", label: "PINs", icon: "🔢", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },
    "Security questions and answers": { type: "credential", label: "Security Q&A", icon: "❓", badge: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.5)" },
    "Encrypted keys": { type: "credential", label: "Encrypted keys", icon: "🔐", badge: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.5)" },
    "Mnemonic phrases": { type: "credential", label: "Mnemonic phrases", icon: "🪙", badge: "rgba(239, 68, 68, 0.25)", border: "rgba(239, 68, 68, 0.6)" },

    // 2. Financial (Amber / Orange)
    "Credit cards": { type: "financial", label: "Credit cards", icon: "💳", badge: "rgba(245, 158, 11, 0.25)", border: "rgba(245, 158, 11, 0.6)" },
    "Credit card CVV": { type: "financial", label: "Credit card CVV", icon: "🔒", badge: "rgba(245, 158, 11, 0.25)", border: "rgba(245, 158, 11, 0.6)" },
    "Bank account numbers": { type: "financial", label: "Bank accounts", icon: "🏦", badge: "rgba(245, 158, 11, 0.25)", border: "rgba(245, 158, 11, 0.6)" },
    "Partial credit card data": { type: "financial", label: "Partial CC", icon: "💳", badge: "rgba(245, 158, 11, 0.2)", border: "rgba(245, 158, 11, 0.5)" },
    "Cryptocurrency wallet addresses": { type: "financial", label: "Crypto wallets", icon: "🪙", badge: "rgba(245, 158, 11, 0.2)", border: "rgba(245, 158, 11, 0.5)" },

    // 3. Government & Identity (Purple / Indigo)
    "Social security numbers": { type: "identity", label: "SSNs", icon: "🪪", badge: "rgba(168, 85, 247, 0.25)", border: "rgba(168, 85, 247, 0.6)" },
    "Passport numbers": { type: "identity", label: "Passports", icon: "🛂", badge: "rgba(168, 85, 247, 0.25)", border: "rgba(168, 85, 247, 0.6)" },
    "Driver's licenses": { type: "identity", label: "Driver's licenses", icon: "🪪", badge: "rgba(168, 85, 247, 0.25)", border: "rgba(168, 85, 247, 0.6)" },
    "Government issued IDs": { type: "identity", label: "Govt IDs", icon: "🏛️", badge: "rgba(168, 85, 247, 0.25)", border: "rgba(168, 85, 247, 0.6)" },
    "Taxation records": { type: "identity", label: "Tax records", icon: "📋", badge: "rgba(168, 85, 247, 0.2)", border: "rgba(168, 85, 247, 0.5)" },

    // 4. Health & Biometrics (Rose / Red)
    "Health insurance information": { type: "health", label: "Health insurance", icon: "🩺", badge: "rgba(244, 63, 94, 0.25)", border: "rgba(244, 63, 94, 0.6)" },
    "Personal health data": { type: "health", label: "Health data", icon: "🏥", badge: "rgba(244, 63, 94, 0.25)", border: "rgba(244, 63, 94, 0.6)" },
    "Biometric data": { type: "health", label: "Biometric data", icon: "🧬", badge: "rgba(244, 63, 94, 0.25)", border: "rgba(244, 63, 94, 0.6)" },
};

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

    // Unified Breach & Multi-Category Search State
    const [breachSearchQuery, setBreachSearchQuery] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [categoryMatchMode, setCategoryMatchMode] = useState<"AND" | "OR">("AND");
    const [searchResultView, setSearchResultView] = useState<"breaches" | "impacted" | "details" | null>(null);
    const [activeDetailBreach, setActiveDetailBreach] = useState<string | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState("");

    // Modal state for clicking on any breach tag
    const [selectedBreachModal, setSelectedBreachModal] = useState<string | null>(null);

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

    // Close breach modal on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setSelectedBreachModal(null);
        };
        if (selectedBreachModal) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [selectedBreachModal]);

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

    // --- Data Classes & Risk Helpers ---

    const breachHasPassword = (breach: any) => {
        if (!breach || !Array.isArray(breach.DataClasses)) return false;
        return breach.DataClasses.some((dc: string) => dc.toLowerCase().includes("password"));
    };

    const breachHasHighRisk = (breach: any) => {
        if (!breach || !Array.isArray(breach.DataClasses)) return null;
        for (const dc of breach.DataClasses) {
            if (HIGH_RISK_DATA_CLASSES[dc]) {
                return HIGH_RISK_DATA_CLASSES[dc];
            }
            if (dc.toLowerCase().includes("password")) {
                return HIGH_RISK_DATA_CLASSES["Passwords"];
            }
        }
        return null;
    };

    const getBreachRiskIcons = (breach: any) => {
        if (!breach || !Array.isArray(breach.DataClasses)) return [];
        const icons: { key: string; icon: string; title: string; color: string }[] = [];
        const dcs = breach.DataClasses.map((dc: string) => dc.toLowerCase());

        // 1. Passwords / Credentials
        if (dcs.some((dc: string) => dc.includes("password") || dc.includes("auth token") || dc.includes("pin") || dc.includes("encrypted key") || dc.includes("mnemonic"))) {
            icons.push({ key: "passwords", icon: "⚠️", title: "Passwords / Credentials Exposed", color: "#f87171" });
        }

        // 2. Financial (Credit Cards / Bank Accounts)
        if (dcs.some((dc: string) => dc.includes("credit card") || dc.includes("bank account") || dc.includes("cvv") || dc.includes("cryptocurrency"))) {
            icons.push({ key: "financial", icon: "💳", title: "Financial Data (Credit Cards / Bank Accounts) Exposed", color: "#fbbf24" });
        }

        // 3. Government & Identity (SSNs / Passports)
        if (dcs.some((dc: string) => dc.includes("social security") || dc.includes("passport") || dc.includes("driver's license") || dc.includes("government issued"))) {
            icons.push({ key: "identity", icon: "🪪", title: "Identity Data (SSNs / Passports / Govt IDs) Exposed", color: "#c084fc" });
        }

        // 4. Health & Biometrics
        if (dcs.some((dc: string) => dc.includes("health") || dc.includes("medical") || dc.includes("biometric"))) {
            icons.push({ key: "health", icon: "🩺", title: "Health / Biometric Records Exposed", color: "#f472b6" });
        }

        return icons;
    };

    const allDataClasses = useMemo(() => {
        const set = new Set<string>();
        Object.values(allBreachesMeta).forEach((b: any) => {
            if (Array.isArray(b.DataClasses)) {
                b.DataClasses.forEach((dc: string) => set.add(dc));
            }
        });
        const list = Array.from(set).sort((a, b) => a.localeCompare(b));
        
        // Priority high risk items at top
        const priority = ["Passwords", "Credit cards", "Social security numbers", "Bank account numbers", "Auth tokens", "Passport numbers", "Health insurance information"];
        const top = priority.filter(p => list.includes(p));
        const rest = list.filter(item => !top.includes(item));
        return [...top, ...rest];
    }, [allBreachesMeta]);

    // Unified Breaches Filter (Supports Name AND/OR Multi-Category Filters)
    const getFilteredBreaches = useMemo(() => {
        let breaches = Object.values(allBreachesMeta);

        if (breachSearchQuery.trim()) {
            const q = breachSearchQuery.trim().toLowerCase();
            breaches = breaches.filter((b: any) =>
                b.Name.toLowerCase().includes(q) || (b.Title && b.Title.toLowerCase().includes(q))
            );
        }

        if (selectedCategories.length > 0) {
            if (categoryMatchMode === "AND") {
                breaches = breaches.filter((b: any) => {
                    const bClasses = Array.isArray(b.DataClasses) ? b.DataClasses.map((c: string) => c.toLowerCase()) : [];
                    return selectedCategories.every(cat => bClasses.includes(cat.toLowerCase()));
                });
            } else {
                breaches = breaches.filter((b: any) => {
                    const bClasses = Array.isArray(b.DataClasses) ? b.DataClasses.map((c: string) => c.toLowerCase()) : [];
                    return selectedCategories.some(cat => bClasses.includes(cat.toLowerCase()));
                });
            }
        }

        return breaches;
    }, [allBreachesMeta, breachSearchQuery, selectedCategories, categoryMatchMode]);

    const getImpactedAliasesForFiltered = useMemo(() => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const matchingNames = new Set(getFilteredBreaches.map((b: any) => b.Name));
        const impacted: string[] = [];
        Object.entries(domainResults.aliases).forEach(([alias, breaches]) => {
            if (breaches.some(bName => matchingNames.has(bName))) {
                impacted.push(alias);
            }
        });
        return impacted;
    }, [domainResults, getFilteredBreaches]);

    const toggleCategoryFilter = (category: string) => {
        setSelectedCategories(prev => 
            prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
        );
    };

    const triggerSearchAction = async (viewType: "breaches" | "impacted" | "details", specificBreach?: string) => {
        setSearchError("");
        if (specificBreach) {
            setActiveDetailBreach(specificBreach);
        } else if (breachSearchQuery && allBreachesMeta[breachSearchQuery]) {
            setActiveDetailBreach(breachSearchQuery);
        } else {
            setActiveDetailBreach(null);
        }

        setSearchResultView(viewType);

        if ((viewType === 'impacted' || viewType === 'details') && !domainResults) {
            setSearchLoading(true);
            await fetchDomainData();
            setSearchLoading(false);
        }
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

    // Unified Mail Merge Export for Single Breach OR Multi-Category Filter
    const exportMailMergeCSV = ({
        breachName,
        activeOnly,
    }: {
        breachName?: string;
        activeOnly: boolean;
    }) => {
        if (!domainResults) return;

        const isSingleBreach = !!breachName;
        const matchingNames = isSingleBreach ? new Set([breachName!]) : new Set(getFilteredBreaches.map((b: any) => b.Name));

        const breachMeta = isSingleBreach ? allBreachesMeta[breachName!] || {} : null;
        const breachTitle = breachMeta?.Title || breachName || (selectedCategories.length > 0 ? `Filtered: ${selectedCategories.join(` ${categoryMatchMode} `)}` : "Multiple Breaches");
        const breachDate = breachMeta?.BreachDate || "Various";
        const breachDetails = breachMeta 
            ? stripHtml(breachMeta.Description) || "N/A" 
            : (selectedCategories.length > 0 ? `Breaches compromising [${selectedCategories.join(`, `)}]` : "Multiple organizational domain breaches");

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
            .filter(([_, breaches]) => breaches.some(b => matchingNames.has(b)))
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
                const matchingUserBreaches = breaches.filter(b => matchingNames.has(b));

                return [
                    email,
                    firstLastName || "N/A",
                    rawName || "N/A",
                    status,
                    isSingleBreach ? breachTitle : matchingUserBreaches.join("; "),
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
        let prefix = "domain_filtered";
        if (isSingleBreach) prefix = breachName!.replace(/[^a-zA-Z0-9_-]/g, "_");
        else if (selectedCategories.length > 0) prefix = `categories_${selectedCategories.map(c => c.replace(/[^a-zA-Z0-9]/g, "")).join("_")}`;

        const filename = `mail_merge_${prefix}_${scopeLabel}_${domainStr}_${new Date().toISOString().split("T")[0]}.csv`;

        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const ExportDropdown = ({
        breachName,
        activeCount,
        totalCount,
        label = "Export CSV",
    }: {
        breachName?: string;
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
                                exportMailMergeCSV({ breachName, activeOnly: true });
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
                                exportMailMergeCSV({ breachName, activeOnly: false });
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
            borderStyle = ad.enabled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)';
            bgStyle = ad.enabled ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)';
        }

        // Aggregate all high-risk exposures across this user's compromised breaches
        const exposures = useMemo(() => {
            const exp = {
                passwords: false,
                financial: false,
                identity: false,
                health: false,
            };
            breachList.forEach((bName: string) => {
                const meta = allBreachesMeta[bName];
                if (!meta || !Array.isArray(meta.DataClasses)) return;
                meta.DataClasses.forEach((dc: string) => {
                    const low = dc.toLowerCase();
                    if (low.includes("password") || low.includes("auth token") || low.includes("pin") || low.includes("encrypted key")) {
                        exp.passwords = true;
                    }
                    if (low.includes("credit card") || low.includes("bank account") || low.includes("cvv") || low.includes("cryptocurrency")) {
                        exp.financial = true;
                    }
                    if (low.includes("social security") || low.includes("passport") || low.includes("driver's license") || low.includes("government issued")) {
                        exp.identity = true;
                    }
                    if (low.includes("health") || low.includes("medical") || low.includes("biometric")) {
                        exp.health = true;
                    }
                });
            });
            return exp;
        }, [breachList]);

        // Helper to render interactive, descriptive breach pills with all risk category icons
        const renderBreachPill = (breachName: string, isLarge = false) => {
            const meta = allBreachesMeta[breachName];
            const riskIcons = getBreachRiskIcons(meta);
            const hasPwd = riskIcons.some(r => r.key === "passwords");
            const categoriesList = meta?.DataClasses ? meta.DataClasses.join(", ") : "Unknown";
            const breachDate = meta?.BreachDate || "Unknown";
            const tooltipText = `${meta?.Title || breachName} • Breached: ${breachDate} • Exposed: ${categoriesList}`;

            return (
                <button
                    key={breachName}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBreachModal(breachName);
                    }}
                    title={`${tooltipText} — Click to view full breach summary`}
                    className={`inline-flex items-center gap-1.5 rounded-lg cursor-pointer transition-all hover:scale-105 shadow-sm text-left ${
                        isLarge ? 'px-3 py-1.5 text-xs font-semibold' : 'px-2.5 py-1 text-[0.75rem] font-medium'
                    }`}
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                    }}
                >
                    {/* Display all high-risk category icons that this breach leaked */}
                    {riskIcons.map(r => (
                        <span key={r.key} title={r.title} className="text-xs shrink-0 select-none">
                            {r.icon}
                        </span>
                    ))}
                    <span>{meta?.Title || breachName}</span>
                </button>
            );
        };

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
                        <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {alias}@{domainStr}
                            {ad && (
                                <span className={`text-[0.7rem] ml-2.5 px-2 py-0.5 rounded font-bold uppercase tracking-wider align-middle inline-flex items-center gap-1 ${
                                    ad.enabled 
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" 
                                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                }`}>
                                    {ad.enabled ? 'Active' : 'Disabled'} {ad.locked ? '(Locked)' : ''}
                                </span>
                            )}
                        </strong>

                        {/* High-Risk Category Exposure Badges (Icon-Only with Hover Tooltips) */}
                        {exposures.passwords && (
                            <span 
                                title="Critical Warning: Exposed in breaches containing Passwords or Authentication Credentials"
                                className="inline-flex items-center justify-center p-1 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-help transition-transform hover:scale-110"
                            >
                                <AlertTriangle size={13} className="text-rose-400 fill-rose-500/20" />
                            </span>
                        )}

                        {exposures.financial && (
                            <span 
                                title="Financial Alert: Exposed in breaches leaking Financial Data (Credit Cards / Bank Accounts)"
                                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs cursor-help transition-transform hover:scale-110"
                            >
                                <span>💳</span>
                            </span>
                        )}

                        {exposures.identity && (
                            <span 
                                title="Identity Alert: Exposed in breaches leaking Government IDs (SSNs / Passports / Driver's Licenses)"
                                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs cursor-help transition-transform hover:scale-110"
                            >
                                <span>🪪</span>
                            </span>
                        )}

                        {exposures.health && (
                            <span 
                                title="Health Alert: Exposed in breaches leaking Health, Medical, or Biometric Records"
                                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-pink-500/20 text-pink-300 border border-pink-500/40 text-xs cursor-help transition-transform hover:scale-110"
                            >
                                <span>🩺</span>
                            </span>
                        )}
                    </div>
                    <div className="text-text-muted">{isExpanded ? '▲' : '▼'}</div>
                </div>

                {!isExpanded && (
                    <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '10px' }}>
                        {breachList.map((breachName: string) => renderBreachPill(breachName, false))}
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
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Breach History (Click any to view details)
                            </h5>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {breachList.map((breachName: string) => renderBreachPill(breachName, true))}
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
                description="Check if your verified organizational domains have been impacted by data breaches or compromised data classes (passwords, credit cards, SSNs, etc.). Enriched with real-time Active Directory status:"
                toolId="hibp-domain"
                icon={<ShieldCheck />}
                actions={
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span className="flex items-center gap-2">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}></span> 
                            Active Account
                        </span>
                        <span className="flex items-center gap-2">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)' }}></span> 
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
                                                                    const riskIcons = getBreachRiskIcons(meta);

                                                                    return (
                                                                        <tr key={b.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setSelectedBreachModal(b.name)}
                                                                                        className="text-left font-semibold text-accent-primary hover:underline bg-transparent border-none p-0 cursor-pointer"
                                                                                    >
                                                                                        {b.name}
                                                                                    </button>
                                                                                    <div className="flex items-center gap-1">
                                                                                        {riskIcons.map(r => (
                                                                                            <span 
                                                                                                key={r.key}
                                                                                                title={r.title}
                                                                                                className="cursor-help text-xs select-none"
                                                                                            >
                                                                                                {r.icon}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
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
                                                                const riskIcons = getBreachRiskIcons(meta);
                                                                return (
                                                                    <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                                        <span className="text-text-secondary flex items-center gap-2">
                                                                            <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>#{idx + 1}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setSelectedBreachModal(b.name)}
                                                                                className="text-left font-semibold text-text-primary hover:text-accent-primary bg-transparent border-none p-0 cursor-pointer"
                                                                            >
                                                                                {b.name}
                                                                            </button>
                                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({b.date})</span>
                                                                            <div className="flex items-center gap-1 ml-1">
                                                                                {riskIcons.map(r => (
                                                                                    <span key={r.key} title={r.title} className="text-xs select-none cursor-help">
                                                                                        {r.icon}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
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
                                                                if (ad) {
                                                                    bg = ad.enabled ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)';
                                                                }

                                                                return (
                                                                    <div key={aliasObj.alias} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
                                                                            {aliasObj.alias}@{domainStr}
                                                                            {ad && (
                                                                                <span className={`text-[0.65rem] ml-2 px-1.5 py-0.2 rounded font-bold uppercase ${
                                                                                    ad.enabled 
                                                                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" 
                                                                                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                                                                }`}>
                                                                                    {ad.enabled ? 'Active' : 'Disabled'}
                                                                                </span>
                                                                            )}
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
                        {/* --- UNIFIED BREACH & CATEGORY SEARCH CARD --- */}
                        <div className="glass-card flex flex-col">
                            <div style={{ flexShrink: 0 }}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                                    <h3 className="m-0">Breach & Category Search</h3>
                                    <span className="text-xs text-text-muted">
                                        Filter by specific breach names, compromised data categories, or combined criteria.
                                    </span>
                                </div>

                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                    Search for breaches by incident name (e.g. <em>LinkedIn</em>) or select multiple data categories (e.g. <em>Passwords</em> + <em>Credit cards</em>) to find exposed accounts on your domain.
                                </p>

                                {/* UNIFIED FILTER CONTROLS */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                                    {/* 1. Breach Name Input */}
                                    <div className="md:col-span-6 input-group m-0">
                                        <label htmlFor="breachSearchQuery" className="text-xs font-semibold text-text-secondary">
                                            Breach Name (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            id="breachSearchQuery"
                                            list="breachNamesList"
                                            value={breachSearchQuery}
                                            onChange={(e) => {
                                                setBreachSearchQuery(e.target.value);
                                                setSearchResultView(null);
                                                setActiveDetailBreach(null);
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

                                    {/* 2. Add Category Dropdown */}
                                    <div className="md:col-span-3 input-group m-0">
                                        <label htmlFor="categorySelector" className="text-xs font-semibold text-text-secondary">
                                            + Add Category Filter
                                        </label>
                                        <select
                                            id="categorySelector"
                                            value=""
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    toggleCategoryFilter(e.target.value);
                                                    setSearchResultView(null);
                                                }
                                            }}
                                            style={{
                                                width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                                color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                                            }}
                                        >
                                            <option value="" disabled className="bg-bg-dark text-text-muted">Select category to add...</option>
                                            {allDataClasses.map((cat) => {
                                                const risk = HIGH_RISK_DATA_CLASSES[cat];
                                                const isSelected = selectedCategories.includes(cat);
                                                return (
                                                    <option key={cat} value={cat} className="bg-bg-dark" disabled={isSelected}>
                                                        {isSelected ? `✓ ${cat} (Selected)` : (risk ? `${risk.icon} ${cat}` : cat)}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>

                                    {/* 3. Target Domain Selector */}
                                    <div className="md:col-span-3 input-group m-0">
                                        <label htmlFor="breachDomainStr" className="text-xs font-semibold text-text-secondary">
                                            Target Domain
                                        </label>
                                        <select
                                            id="breachDomainStr"
                                            value={domainStr}
                                            onChange={(e) => {
                                                setDomainStr(e.target.value);
                                                setDomainResults(null);
                                                setActiveView(null);
                                                setSearchResultView(null);
                                            }}
                                            style={{
                                                width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                                color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none'
                                            }}
                                        >
                                            {availableDomains.map(d => (
                                                <option key={d.DomainName} value={d.DomainName} className="bg-bg-dark">{d.DomainName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* ACTIVE CATEGORY CHIPS & QUICK PRESETS */}
                                <div className="p-3 bg-bg-dark/60 border border-border-color/80 rounded-xl mb-4 flex flex-col gap-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-text-muted flex items-center gap-1">
                                                <Filter size={13} />
                                                <span>Active Filters:</span>
                                            </span>

                                            {selectedCategories.length === 0 && !breachSearchQuery && (
                                                <span className="text-xs text-text-muted italic">
                                                    No category filters active (showing all {Object.keys(allBreachesMeta).length} global breaches)
                                                </span>
                                            )}

                                            {selectedCategories.map(cat => {
                                                const risk = HIGH_RISK_DATA_CLASSES[cat];
                                                return (
                                                    <span 
                                                        key={cat}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm"
                                                        style={{
                                                            background: risk ? risk.badge : 'var(--bg-surface-hover)',
                                                            border: risk ? `1px solid ${risk.border}` : '1px solid var(--border-color)',
                                                            color: 'var(--text-primary)'
                                                        }}
                                                    >
                                                        <span>{risk ? risk.icon : '📁'} {cat}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCategoryFilter(cat)}
                                                            className="hover:text-red-400 p-0.5 rounded cursor-pointer bg-transparent border-none text-text-muted transition-colors inline-flex items-center"
                                                            title={`Remove ${cat} filter`}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                );
                                            })}

                                            {selectedCategories.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCategories([]);
                                                        setSearchResultView(null);
                                                    }}
                                                    className="text-xs text-text-muted hover:text-red-400 underline ml-1 cursor-pointer bg-transparent border-none"
                                                >
                                                    Clear Filters
                                                </button>
                                            )}
                                        </div>

                                        {/* Match Mode Toggle when > 1 category selected */}
                                        {selectedCategories.length > 1 && (
                                            <div className="flex items-center gap-1.5 p-1 bg-bg-surface border border-border-color rounded-lg text-xs">
                                                <span className="text-text-muted px-1">Logic:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCategoryMatchMode("AND")}
                                                    className={`px-2 py-0.5 rounded text-xs font-bold border-none cursor-pointer ${
                                                        categoryMatchMode === "AND" 
                                                            ? "bg-accent-primary text-white" 
                                                            : "bg-transparent text-text-muted hover:text-text-primary"
                                                    }`}
                                                    title="Match breaches containing ALL selected categories"
                                                >
                                                    ALL (AND)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCategoryMatchMode("OR")}
                                                    className={`px-2 py-0.5 rounded text-xs font-bold border-none cursor-pointer ${
                                                        categoryMatchMode === "OR" 
                                                            ? "bg-accent-primary text-white" 
                                                            : "bg-transparent text-text-muted hover:text-text-primary"
                                                    }`}
                                                    title="Match breaches containing ANY of the selected categories"
                                                >
                                                    ANY (OR)
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quick Preset Buttons */}
                                    <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border-color/40 text-xs">
                                        <span className="text-[0.7rem] font-bold text-text-muted uppercase tracking-wider mr-1">Quick Presets:</span>
                                        {[
                                            { name: "Passwords", icon: "⚠️" },
                                            { name: "Credit cards", icon: "💳" },
                                            { name: "Social security numbers", icon: "🪪" },
                                            { name: "Bank account numbers", icon: "🏦" },
                                            { name: "Auth tokens", icon: "🔑" },
                                            { name: "Health insurance information", icon: "🩺" }
                                        ].map(preset => {
                                            const isActive = selectedCategories.includes(preset.name);
                                            return (
                                                <button
                                                    key={preset.name}
                                                    type="button"
                                                    onClick={() => {
                                                        toggleCategoryFilter(preset.name);
                                                        setSearchResultView(null);
                                                    }}
                                                    className={`px-2 py-1 rounded-md text-[0.75rem] font-semibold border cursor-pointer transition-all inline-flex items-center gap-1 ${
                                                        isActive 
                                                            ? "bg-accent-primary/20 text-accent-primary border-accent-primary/50" 
                                                            : "bg-bg-surface hover:bg-bg-surface-hover text-text-secondary border-border-color"
                                                    }`}
                                                >
                                                    <span>{preset.icon}</span>
                                                    <span>{preset.name}</span>
                                                    {isActive && <CheckCircle2 size={11} className="text-accent-primary" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* UNIFIED ACTION BUTTONS */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: searchResultView === 'breaches' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: searchResultView === 'breaches' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: searchResultView === 'breaches' ? '#fff' : 'var(--text-secondary)'
                                        }}
                                        onClick={() => triggerSearchAction("breaches")}
                                        disabled={Object.keys(allBreachesMeta).length === 0}
                                    >
                                        Matching Breaches ({getFilteredBreaches.length})
                                    </button>

                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: searchResultView === 'impacted' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: searchResultView === 'impacted' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: searchResultView === 'impacted' ? '#fff' : 'var(--text-secondary)'
                                        }}
                                        onClick={() => triggerSearchAction("impacted")}
                                        disabled={searchLoading || Object.keys(allBreachesMeta).length === 0}
                                    >
                                        {searchLoading && searchResultView === 'impacted' ? 'Loading Domain...' : 'View Impacted Domain Accounts'}
                                    </button>

                                    {breachSearchQuery && allBreachesMeta[breachSearchQuery] && (
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            style={{
                                                background: searchResultView === 'details' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                                borderColor: searchResultView === 'details' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                                color: searchResultView === 'details' ? '#fff' : 'var(--text-secondary)'
                                            }}
                                            onClick={() => triggerSearchAction("details", breachSearchQuery)}
                                        >
                                            Breach Details ({allBreachesMeta[breachSearchQuery].Title})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {searchError && (
                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginTop: '1rem' }}>
                                    <strong>Error:</strong> {searchError}
                                </div>
                            )}

                            {/* --- RESULT VIEW 1: SPECIFIC BREACH DETAILS CARD --- */}
                            {searchResultView === 'details' && activeDetailBreach && allBreachesMeta[activeDetailBreach] && (
                                <div style={{ flex: 1, marginTop: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {(() => {
                                        const breach = allBreachesMeta[activeDetailBreach];
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
                                                        const risk = HIGH_RISK_DATA_CLASSES[dc];
                                                        const isPwd = dc.toLowerCase().includes("password");
                                                        return (
                                                            <span 
                                                                key={dc} 
                                                                style={{ 
                                                                    background: isPwd ? 'rgba(239, 68, 68, 0.25)' : (risk ? risk.badge : 'var(--bg-surface-hover)'), 
                                                                    border: isPwd ? '1px solid rgba(239, 68, 68, 0.6)' : (risk ? `1px solid ${risk.border}` : '1px solid var(--border-color)'),
                                                                    color: isPwd ? '#fca5a5' : 'var(--text-primary)', 
                                                                    fontWeight: (isPwd || risk) ? 700 : 500,
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
                                                                {!isPwd && risk && <span>{risk.icon}</span>}
                                                                <span>{dc}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* --- RESULT VIEW 2: MATCHING BREACHES TABLE --- */}
                            {searchResultView === 'breaches' && (
                                <div style={{ flex: 1, marginTop: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                                            {getFilteredBreaches.length} Matching Global Breaches
                                        </h4>
                                        <span className="text-xs text-text-muted">
                                            {selectedCategories.length > 0 && `Criteria: [${selectedCategories.join(` ${categoryMatchMode} `)}]`}
                                        </span>
                                    </div>

                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                            <thead className="sticky-header">
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface-hover)' }}>
                                                    <th style={{ padding: '12px 16px' }}>Breach Name</th>
                                                    <th style={{ padding: '12px 16px' }}>Breach Date</th>
                                                    <th style={{ padding: '12px 16px' }}>Exposed Data Highlights</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Pwn Count</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {getFilteredBreaches.map((b: any) => {
                                                    const riskIcons = getBreachRiskIcons(b);

                                                    return (
                                                        <tr key={b.Name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedBreachModal(b.Name)}
                                                                        className="text-left font-semibold text-accent-primary hover:underline bg-transparent border-none p-0 cursor-pointer"
                                                                    >
                                                                        {b.Title || b.Name}
                                                                    </button>
                                                                    <div className="flex items-center gap-1">
                                                                        {riskIcons.map(r => (
                                                                            <span 
                                                                                key={r.key}
                                                                                title={r.title}
                                                                                className="cursor-help text-xs select-none"
                                                                            >
                                                                                {r.icon}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{b.BreachDate}</td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <div className="flex gap-1 flex-wrap max-w-md">
                                                                    {(b.DataClasses || []).slice(0, 3).map((dc: string) => {
                                                                        const risk = HIGH_RISK_DATA_CLASSES[dc];
                                                                        const isPwd = dc.toLowerCase().includes("password");
                                                                        return (
                                                                            <span 
                                                                                key={dc}
                                                                                className="text-[0.7rem] px-2 py-0.5 rounded"
                                                                                style={{
                                                                                    background: isPwd ? 'rgba(239,68,68,0.2)' : (risk ? risk.badge : 'var(--bg-surface-hover)'),
                                                                                    color: isPwd ? '#fca5a5' : 'var(--text-muted)'
                                                                                }}
                                                                            >
                                                                                {isPwd ? '⚠️ Passwords' : (risk ? `${risk.icon} ${dc}` : dc)}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                    {(b.DataClasses || []).length > 3 && (
                                                                        <span className="text-[0.65rem] text-text-muted self-center">
                                                                            +{(b.DataClasses || []).length - 3} more
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fca5a5', fontWeight: 600 }}>
                                                                {b.PwnCount.toLocaleString()}
                                                            </td>
                                                            <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedBreachModal(b.Name)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                                    >
                                                                        Summary
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setBreachSearchQuery(b.Name);
                                                                            triggerSearchAction("impacted", b.Name);
                                                                        }}
                                                                        className="btn-primary"
                                                                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                                    >
                                                                        Check Domain
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- RESULT VIEW 3: IMPACTED DOMAIN ACCOUNTS --- */}
                            {searchResultView === 'impacted' && (
                                <div style={{ flex: 1, marginTop: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    {domainError && (
                                        <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                            <strong>Domain Error:</strong> {domainError}
                                        </div>
                                    )}

                                    {domainResults && (
                                        getImpactedAliasesForFiltered.length === 0 ? (
                                            <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                                <strong>Clean!</strong> No accounts on {domainStr} were impacted by breaches matching your search filter.
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                                {(() => {
                                                    const impacted = getImpactedAliasesForFiltered;
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
                                                                    {selectedCategories.length > 0 
                                                                        ? `Matching criteria: [${selectedCategories.join(` ${categoryMatchMode} `)}]` 
                                                                        : (breachSearchQuery ? `Breach: ${breachSearchQuery}` : "Filtered Breaches")}
                                                                </p>
                                                            </div>

                                                            <ExportDropdown
                                                                breachName={activeDetailBreach || undefined}
                                                                activeCount={activeCount}
                                                                totalCount={impacted.length}
                                                                label="Export Impacted Accounts"
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', overflowY: 'auto' }}>
                                                    {getImpactedAliasesForFiltered.map(alias => (
                                                        <EmailRecord key={alias} alias={alias} breachList={domainResults.aliases[alias]} />
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* --- BREACH INFORMATION MODAL (TRIGGERED ON CLICK OF ANY BREACH PILL OR NAME) --- */}
            {selectedBreachModal && allBreachesMeta[selectedBreachModal] && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={() => setSelectedBreachModal(null)}
                >
                    <div 
                        className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-border-color rounded-2xl"
                        style={{ background: 'var(--bg-surface)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            const breach = allBreachesMeta[selectedBreachModal];
                            const hasPassword = breachHasPassword(breach);
                            const highRisk = breachHasHighRisk(breach);

                            return (
                                <>
                                    {/* Modal Header */}
                                    <div className="p-5 border-b border-border-color flex justify-between items-start gap-4">
                                        <div>
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <h3 className="text-xl font-bold text-accent-primary m-0">
                                                    {breach.Title || breach.Name}
                                                </h3>
                                                {hasPassword && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50 text-xs font-bold shadow-sm">
                                                        <AlertTriangle size={13} className="text-rose-400 fill-rose-500/20" />
                                                        <span>Passwords Exposed</span>
                                                    </span>
                                                )}
                                                {!hasPassword && highRisk && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm" style={{ background: highRisk.badge, border: `1px solid ${highRisk.border}` }}>
                                                        <span>{highRisk.icon} {highRisk.label} Exposed</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-text-muted mt-1.5">
                                                <span>Breach Date: <strong className="text-text-secondary">{breach.BreachDate}</strong></span>
                                                <span>•</span>
                                                <span>Pwned Accounts Globally: <strong className="text-rose-300 font-mono">{breach.PwnCount.toLocaleString()}</strong></span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedBreachModal(null)}
                                            className="p-1.5 rounded-lg bg-bg-surface-hover hover:bg-bg-dark text-text-muted hover:text-text-primary border border-border-color cursor-pointer transition-colors"
                                            title="Close modal"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="p-5 overflow-y-auto flex flex-col gap-4">
                                        <div>
                                            <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                                Breach Summary
                                            </h5>
                                            <div 
                                                className="text-sm text-text-secondary leading-relaxed p-4 bg-bg-dark rounded-xl border border-border-color/60"
                                                dangerouslySetInnerHTML={{ __html: breach.Description }}
                                            />
                                        </div>

                                        <div>
                                            <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                                Compromised Data Categories ({breach.DataClasses.length})
                                            </h5>
                                            <div className="flex flex-wrap gap-1.5">
                                                {breach.DataClasses.map((dc: string) => {
                                                    const risk = HIGH_RISK_DATA_CLASSES[dc];
                                                    const isPwd = dc.toLowerCase().includes("password");
                                                    return (
                                                        <span 
                                                            key={dc} 
                                                            style={{ 
                                                                background: isPwd ? 'rgba(239, 68, 68, 0.25)' : (risk ? risk.badge : 'var(--bg-surface-hover)'), 
                                                                border: isPwd ? '1px solid rgba(239, 68, 68, 0.6)' : (risk ? `1px solid ${risk.border}` : '1px solid var(--border-color)'),
                                                                color: isPwd ? '#fca5a5' : 'var(--text-primary)', 
                                                                fontWeight: (isPwd || risk) ? 700 : 500,
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
                                                            {!isPwd && risk && <span>{risk.icon}</span>}
                                                            <span>{dc}</span>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="p-4 border-t border-border-color flex items-center justify-between gap-3 bg-bg-dark/40">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const bName = selectedBreachModal;
                                                setSelectedBreachModal(null);
                                                setActiveTab("breach");
                                                setBreachSearchQuery(bName);
                                                triggerSearchAction("impacted", bName);
                                            }}
                                            className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold cursor-pointer shadow-sm"
                                        >
                                            <span>Check Domain Impact</span>
                                        </button>

                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-text-muted">
                                                Press <kbd className="px-1.5 py-0.5 rounded bg-bg-surface border border-border-color text-[0.7rem]">Esc</kbd> to close
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedBreachModal(null)}
                                                className="btn-secondary px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
