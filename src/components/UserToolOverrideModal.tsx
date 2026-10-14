"use client";

import React, { useState, useEffect } from "react";
import { 
    X, Shield, KeyRound, Check, RotateCcw, AlertTriangle, 
    Sparkles, Lock, Layers, Network, Server, Globe, Mail, 
    FileText, Link2, UserX, DownloadCloud, BellRing, ShieldAlert, ShieldCheck
} from "lucide-react";
import { 
    getPermissionsForRole, 
    getUserToolOverrides, 
    saveAllUserToolOverrides 
} from "@/app/actions/permissions";

interface ToolDef {
    id: string;
    name: string;
    description: string;
    icon?: React.ReactNode;
}

interface ToolCategory {
    category: string;
    tools: ToolDef[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
    {
        category: "Perimeter & Access",
        tools: [
            { id: "firewall", name: "Cisco Firewall Utilities", description: "IP shun checking, threat isolation, and Guardian automation logs" },
            { id: "ise", name: "Cisco ISE Center", description: "RADIUS telemetry, endpoint connection tracking, and failure triage" },
            { id: "account-lockout", name: "Account Lockout Investigator", description: "AD security log correlation with Cisco ISE wireless EAP" },
            { id: "ise-tacacs", name: "TACACS+ Administration", description: "Command authorization and administrative network switch audits" }
        ]
    },
    {
        category: "VPN Solutions",
        tools: [
            { id: "vpn", name: "Remote Access VPN", description: "AnyConnect live sessions, capacity, and disconnection anomaly triage" },
            { id: "vpn-reporting", name: "RA VPN Reporting", description: "Historical connection and disconnection audit reporting" },
            { id: "vpn-s2s", name: "Site-to-Site VPN Monitor", description: "Cisco FTD/FMC IPsec & IKE tunnel health and status" }
        ]
    },
    {
        category: "Threat Intelligence & Telemetry",
        tools: [
            { id: "hibp-account", name: "HIBP Account Security", description: "Individual corporate employee account breach exposure scan" },
            { id: "hibp-domain", name: "HIBP Domain Security", description: "Domain-wide breach telemetry across CooperHealth scopes" },
            { id: "threat-intel", name: "Threat Intelligence", description: "Multi-engine IP, DNS, and file hash reputation analysis" },
            { id: "ironport", name: "Cisco IronPort Telemetry", description: "Mail gateway health, spam rejection, and delivery status" },
            { id: "bec", name: "M365 BEC Threat Hunter", description: "Business Email Compromise link analysis and mailbox threats" },
            { id: "etd", name: "Cisco ETD Retrospective Center", description: "Post-delivery malicious email retrospective tracking" },
            { id: "netscaler", name: "NetScaler Gateway & ADC", description: "Citrix ADC telemetry, foreign authentication, and CVE mitigations" },
            { id: "notification-center", name: "Breach Notification Center", description: "Automated breach alerts and security campaign dispatches" },
            { id: "crawler", name: "Network Crawler & Topology", description: "Network topology discovery, switch port lookup, and hierarchy" }
        ]
    },
    {
        category: "Utilities & Analytics",
        tools: [
            { id: "graylog-exporter", name: "Graylog Bulk Exporter", description: "Large-scale asynchronous Elasticsearch log export engine" },
            { id: "vectra", name: "Vectra Time Machine", description: "Network detection and response (NDR) behavioral forensics" }
        ]
    }
];

interface UserToolOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        id: string;
        username: string;
        firstName?: string | null;
        lastName?: string | null;
        role: string;
    } | null;
    onSaved?: () => void;
}

export default function UserToolOverrideModal({
    isOpen,
    onClose,
    user,
    onSaved
}: UserToolOverrideModalProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rolePerms, setRolePerms] = useState<string[]>([]);
    // overrides map: toolId -> true (grant), false (deny), or null (inherit)
    const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});

    useEffect(() => {
        if (!isOpen || !user) return;

        let isMounted = true;
        setLoading(true);

        async function loadData() {
            try {
                const [roleList, userOverridesList] = await Promise.all([
                    getPermissionsForRole(user!.role),
                    getUserToolOverrides(user!.id)
                ]);

                if (!isMounted) return;

                setRolePerms(roleList);

                const map: Record<string, boolean | null> = {};
                for (const o of userOverridesList) {
                    map[o.toolId] = o.isEnabled;
                }
                setOverrides(map);
            } catch (err) {
                console.error("Failed to load user tool permissions:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadData();

        return () => {
            isMounted = false;
        };
    }, [isOpen, user]);

    if (!isOpen || !user) return null;

    const roleUpper = String(user.role).toUpperCase();
    const isAdmin = roleUpper === "ADMIN";

    const handleToggle = (toolId: string) => {
        const roleHasAccess = rolePerms.includes(toolId);
        const currentOverride = overrides[toolId];

        setOverrides(prev => {
            const next = { ...prev };
            if (roleHasAccess) {
                // If role has access, default is inherit (enabled).
                // Toggling switches between Inherit (enabled) and Explicit Deny (false).
                if (currentOverride === false) {
                    delete next[toolId]; // Revert to inherit (enabled)
                } else {
                    next[toolId] = false; // Explicit deny
                }
            } else {
                // If role does NOT have access, default is inherit (disabled).
                // Toggling switches between Inherit (disabled) and Explicit Grant (true).
                if (currentOverride === true) {
                    delete next[toolId]; // Revert to inherit (disabled)
                } else {
                    next[toolId] = true; // Enhanced grant
                }
            }
            return next;
        });
    };

    const handleResetAll = () => {
        setOverrides({});
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveAllUserToolOverrides(user.id, overrides);
            if (onSaved) onSaved();
            onClose();
        } catch (err: any) {
            alert("Failed to save tool overrides: " + (err.message || String(err)));
        } finally {
            setSaving(false);
        }
    };

    // Calculate count of custom overrides
    const overrideKeys = Object.keys(overrides).filter(k => overrides[k] !== null);
    const enhancedGrants = overrideKeys.filter(k => overrides[k] === true);
    const explicitDenies = overrideKeys.filter(k => overrides[k] === false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div 
                className="bg-bg-surface border border-border-color rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-border-color flex items-start justify-between bg-bg-dark/40">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="p-1.5 rounded-lg bg-accent-glow text-accent-primary">
                                <KeyRound size={18} />
                            </span>
                            <h2 className="text-lg font-bold text-text-primary">
                                Tool Access Overrides: <span className="font-mono text-accent-primary">{user.username}</span>
                            </h2>
                            <span className="px-2 py-0.5 rounded text-xs font-bold border border-border-color bg-bg-dark text-text-secondary">
                                Base Role: <strong className="text-text-primary ml-1">{user.role}</strong>
                            </span>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Grant enhanced access to specific tools beyond their base role permissions without modifying corporate AD groups.
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer border-none bg-transparent"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Overrides Status Banner */}
                <div className="px-5 py-2.5 bg-bg-dark/20 border-b border-border-color flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                        <span className="text-text-secondary">Active Custom Overrides:</span>
                        {enhancedGrants.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                +{enhancedGrants.length} Enhanced Grant{enhancedGrants.length > 1 ? "s" : ""}
                            </span>
                        )}
                        {explicitDenies.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                                -{explicitDenies.length} Explicit Den{explicitDenies.length > 1 ? "ies" : "y"}
                            </span>
                        )}
                        {overrideKeys.length === 0 && (
                            <span className="text-text-muted italic">
                                Pure Role Inheritance (0 custom overrides)
                            </span>
                        )}
                    </div>

                    {overrideKeys.length > 0 && (
                        <button
                            onClick={handleResetAll}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                        >
                            <RotateCcw size={12} />
                            <span>Reset to Role Defaults</span>
                        </button>
                    )}
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {loading ? (
                        <div className="py-16 text-center text-text-muted text-xs flex flex-col items-center justify-center gap-2">
                            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                            <span>Loading user permissions and active overrides...</span>
                        </div>
                    ) : isAdmin ? (
                        <div className="p-8 text-center rounded-xl border border-accent-primary/20 bg-accent-glow/10 space-y-2">
                            <Sparkles size={28} className="text-accent-primary mx-auto" />
                            <h3 className="text-sm font-bold text-text-primary">Full Administrator Privileges</h3>
                            <p className="text-xs text-text-secondary max-w-md mx-auto">
                                Users with the <strong>ADMIN</strong> role hold unrestricted access to all system tools and administrator controls. Per-user tool overrides are not needed for administrators.
                            </p>
                        </div>
                    ) : (
                        TOOL_CATEGORIES.map(category => (
                            <div key={category.category} className="space-y-2.5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted px-1 border-b border-border-color pb-1">
                                    {category.category}
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {category.tools.map(tool => {
                                        const roleHasAccess = rolePerms.includes(tool.id);
                                        const override = overrides[tool.id];
                                        
                                        // Effective state:
                                        // If override === true => granted
                                        // If override === false => denied
                                        // If override === undefined/null => roleHasAccess
                                        const isEffectiveGranted = override === true || (override === undefined && roleHasAccess);
                                        const isCustomGrant = override === true && !roleHasAccess;
                                        const isCustomDeny = override === false && roleHasAccess;
                                        const isInherited = override === undefined;

                                        return (
                                            <div
                                                key={tool.id}
                                                className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                                                    isCustomGrant
                                                        ? "border-emerald-500/50 bg-emerald-950/20"
                                                        : isCustomDeny
                                                        ? "border-rose-500/50 bg-rose-950/20"
                                                        : isEffectiveGranted
                                                        ? "border-accent-primary/30 bg-bg-surface"
                                                        : "border-border-color bg-bg-dark/40 opacity-70"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="font-semibold text-text-primary text-xs">
                                                            {tool.name}
                                                        </div>
                                                        <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                                                            {tool.description}
                                                        </div>
                                                    </div>

                                                    {/* Status Badge */}
                                                    <div className="shrink-0">
                                                        {isCustomGrant && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                                Enhanced Grant
                                                            </span>
                                                        )}
                                                        {isCustomDeny && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                                                Denied
                                                            </span>
                                                        )}
                                                        {isInherited && (
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                                                roleHasAccess
                                                                    ? "bg-accent-glow text-accent-primary border-accent-primary/20"
                                                                    : "bg-bg-dark text-text-muted border-border-color"
                                                            }`}>
                                                                {roleHasAccess ? `Role: Enabled` : `Role: Disabled`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Bar */}
                                                <div className="mt-3 pt-2 border-t border-border-color/50 flex items-center justify-between">
                                                    <span className="text-[11px] text-text-muted">
                                                        {isEffectiveGranted ? (
                                                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                                                <Check size={11} /> Accessible
                                                            </span>
                                                        ) : (
                                                            <span className="text-text-muted">No Access</span>
                                                        )}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggle(tool.id)}
                                                        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-all border ${
                                                            isCustomGrant
                                                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                                                                : isCustomDeny
                                                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                                                                : roleHasAccess
                                                                ? "bg-bg-dark hover:bg-rose-950/30 text-text-secondary hover:text-rose-300 border-border-color hover:border-rose-500/30"
                                                                : "bg-bg-dark hover:bg-emerald-950/30 text-text-secondary hover:text-emerald-300 border-border-color hover:border-emerald-500/30"
                                                        }`}
                                                    >
                                                        {isCustomGrant
                                                            ? "Remove Grant"
                                                            : isCustomDeny
                                                            ? "Remove Deny"
                                                            : roleHasAccess
                                                            ? "Revoke Access"
                                                            : "+ Grant Access"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border-color bg-bg-dark/60 flex items-center justify-between">
                    <span className="text-xs text-text-muted">
                        Changes are saved permanently and take effect on the user's next navigation or page load.
                    </span>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-3.5 py-1.5 rounded-lg border border-border-color bg-transparent hover:bg-bg-surface text-text-secondary hover:text-text-primary text-xs font-semibold cursor-pointer transition-colors"
                        >
                            Cancel
                        </button>
                        {!isAdmin && (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Saving Overrides...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={14} />
                                        <span>Save Overrides</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
