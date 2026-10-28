"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
    getToolPermissions, 
    updateToolPermission, 
    getPermissionsDiagnostic, 
    resetPermissions,
    getInternalLogs,
    getRoleDefaultPermissions,
    updateRoleDefaultPermission,
    saveAllRoleDefaultPermissions,
    saveCurrentAsRoleDefaults,
    resetRoleDefaultsToFactory
} from "@/app/actions/permissions";
import { TOOLS, ROLES, SYSTEM_DEFAULT_PERMISSIONS_MAP } from "@/lib/permissions-constants";
import { 
    Shield, 
    Sliders, 
    Sparkles, 
    RotateCcw, 
    Save, 
    Check, 
    AlertCircle, 
    KeyRound, 
    Activity, 
    FileText,
    CheckCircle2,
    XCircle
} from "lucide-react";

export default function PermissionsPage() {
    const router = useRouter();
    
    // View mode: "active" (live permissions) or "defaults" (role default definitions)
    const [viewMode, setViewMode] = useState<"active" | "defaults">("active");

    const [permissions, setPermissions] = useState<any[]>([]);
    const [roleDefaults, setRoleDefaults] = useState<Record<string, Record<string, boolean>>>(SYSTEM_DEFAULT_PERMISSIONS_MAP);
    const [isDefaultsCustomized, setIsDefaultsCustomized] = useState(false);
    const [customDefaultsCount, setCustomDefaultsCount] = useState(0);

    // Draft state for defaults matrix when in "defaults" mode
    const [draftDefaults, setDraftDefaults] = useState<Record<string, Record<string, boolean>>>(SYSTEM_DEFAULT_PERMISSIONS_MAP);
    const [hasUnsavedDefaults, setHasUnsavedDefaults] = useState(false);
    const [applyDefaultsToActive, setApplyDefaultsToActive] = useState(true);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [savingDefaults, setSavingDefaults] = useState(false);

    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [logs, setLogs] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [selectedRolesForReset, setSelectedRolesForReset] = useState<string[]>([]);
    const [selectedToolsForReset, setSelectedToolsForReset] = useState<string[]>([]);
    const [resetType, setResetType] = useState<"role" | "tool">("role");

    // Success notification
    const [statusBanner, setStatusBanner] = useState<{ message: string; type: "success" | "info" } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [permsData, defaultsData] = await Promise.all([
                getToolPermissions(),
                getRoleDefaultPermissions()
            ]);
            setPermissions(permsData);
            setRoleDefaults(defaultsData.defaults);
            setDraftDefaults(JSON.parse(JSON.stringify(defaultsData.defaults)));
            setIsDefaultsCustomized(defaultsData.isCustomized);
            setCustomDefaultsCount(defaultsData.customCount);
            setHasUnsavedDefaults(false);
        } catch (err: any) {
            console.error("Failed to load permissions data:", err);
        } finally {
            setLoading(false);
        }
    };

    const showNotification = (message: string, type: "success" | "info" = "success") => {
        setStatusBanner({ message, type });
        setTimeout(() => {
            setStatusBanner(null);
        }, 6000);
    };

    const handleResetActive = async (roles?: string[], tools?: string[]) => {
        setLoading(true);
        try {
            await resetPermissions(roles, tools);
            router.refresh();
            await loadData();
            setShowResetModal(false);
            if (roles) {
                showNotification(`Permissions reset to role defaults for: ${roles.join(', ')}`);
            } else if (tools) {
                const toolNames = tools.map(tid => TOOLS.find(t => t.id === tid)?.name || tid);
                showNotification(`Permissions reset to role defaults for tools: ${toolNames.join(', ')}`);
            } else {
                showNotification("Active permissions reset successfully to authoritative role defaults!");
            }
        } catch (err: any) {
            alert("Failed to reset: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Promote Current Active Matrix to Role Defaults
    const handlePromoteActiveAsDefaults = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to save the entire current active permissions matrix as the new SYSTEM ROLE DEFAULTS?\n\n" +
            "This will establish these tool permissions as the baseline across all roles when resetting permissions or creating users. Fully audit-logged."
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            const res = await saveCurrentAsRoleDefaults();
            router.refresh();
            await loadData();
            showNotification(`Successfully promoted active permissions (${res.count} cells) as authoritative system role defaults!`);
        } catch (err: any) {
            alert("Failed to save as defaults: " + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    // Toggle default in draft defaults matrix
    const handleToggleDraftDefault = (toolId: string, role: string) => {
        if (role === "ADMIN") return; // Admin is permanently enabled
        setDraftDefaults(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            if (!next[toolId]) next[toolId] = {};
            const currentVal = next[toolId][role] ?? false;
            next[toolId][role] = !currentVal;
            return next;
        });
        setHasUnsavedDefaults(true);
    };

    // Save All Role Defaults
    const handleSaveRoleDefaults = async () => {
        setSavingDefaults(true);
        try {
            await saveAllRoleDefaultPermissions(draftDefaults, applyDefaultsToActive);
            router.refresh();
            await loadData();
            setHasUnsavedDefaults(false);
            showNotification(
                `Role system defaults saved successfully!${applyDefaultsToActive ? ' (and active permissions updated)' : ''}`
            );
        } catch (err: any) {
            alert("Failed to save role defaults: " + (err.message || String(err)));
        } finally {
            setSavingDefaults(false);
        }
    };

    // Revert role defaults back to factory system baseline
    const handleRevertDefaultsToFactory = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to revert all system role defaults back to factory built-in defaults?\n\n" +
            "This will remove all custom default records stored in the database."
        );
        if (!confirmed) return;

        setLoading(true);
        try {
            await resetRoleDefaultsToFactory();
            router.refresh();
            await loadData();
            showNotification("System role defaults reverted to factory baseline settings.");
        } catch (err: any) {
            alert("Failed to revert defaults: " + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const runDiagnostics = async () => {
        setLoading(true);
        try {
            const info = await getPermissionsDiagnostic();
            setDebugInfo(info);
            setShowDebug(true);
        } catch (err: any) {
            alert("Diagnostics failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const viewLogs = async () => {
        setLoading(true);
        try {
            const content = await getInternalLogs();
            setLogs(content);
            setShowLogs(true);
        } catch (err: any) {
            alert("Failed to fetch logs: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleActivePermission = async (toolId: string, role: string) => {
        const current = permissions.find((p: any) => p.toolId === toolId && p.role === role);
        const currentVal = current ? current.isEnabled : (roleDefaults[toolId]?.[role] ?? false);
        const newState = !currentVal;
        
        // Optimistic update
        const updatedPermissions = permissions.map(p => 
            (p.toolId === toolId && p.role === role) ? { ...p, isEnabled: newState } : p
        );
        if (!permissions.find(p => p.toolId === toolId && p.role === role)) {
            updatedPermissions.push({ toolId, role, isEnabled: newState });
        }
        setPermissions(updatedPermissions);

        setSaving(`${toolId}-${role}`);
        try {
            await updateToolPermission(toolId, role, newState);
            router.refresh();
            const refreshed = await getToolPermissions();
            setPermissions(refreshed);
        } catch (err: any) {
            alert("Failed to update: " + err.message);
            await loadData(); // Revert
        } finally {
            setSaving(null);
        }
    };

    const isActiveEnabled = (toolId: string, role: string) => {
        const p = permissions.find((per: any) => per.toolId === toolId && per.role === role);
        if (p) return p.isEnabled;
        return roleDefaults[toolId]?.[role] ?? false;
    };

    const isActiveDefault = (toolId: string, role: string) => {
        const currentEnabled = isActiveEnabled(toolId, role);
        const defaultEnabled = roleDefaults[toolId]?.[role] ?? false;
        return currentEnabled === defaultEnabled;
    };

    if (loading && permissions.length === 0) return (
        <div className="p-12 text-center text-text-muted flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading permissions matrix & role defaults...</span>
        </div>
    );

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="m-0 text-2xl font-bold">Tool Permissions & Role Defaults</h1>
                            {isDefaultsCustomized && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                                    Custom Defaults Active ({customDefaultsCount})
                                </span>
                            )}
                        </div>
                        <p className="text-text-secondary text-xs mt-1">
                            Manage live tool access by role and configure authoritative default tools per role with complete audit logging.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button onClick={viewLogs} className="btn-secondary text-[0.8rem] bg-white/5">
                            <FileText size={13} className="inline mr-1" />
                            Technical Logs
                        </button>
                        <button onClick={runDiagnostics} className="btn-secondary text-[0.8rem]">
                            <Activity size={13} className="inline mr-1" />
                            Diagnostics
                        </button>
                        {viewMode === "active" ? (
                            <>
                                <button 
                                    onClick={handlePromoteActiveAsDefaults} 
                                    className="btn-secondary text-[0.8rem] border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                                    title="Save the current active matrix as the new authoritative baseline defaults"
                                >
                                    <Save size={13} className="inline mr-1" />
                                    Save Matrix as Defaults
                                </button>
                                <button 
                                    onClick={() => {
                                        setSelectedRolesForReset([]);
                                        setSelectedToolsForReset([]);
                                        setResetType("role");
                                        setShowResetModal(true);
                                    }} 
                                    className="btn-danger text-[0.8rem] bg-red-800"
                                >
                                    <RotateCcw size={13} className="inline mr-1" />
                                    Reset Active
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={handleRevertDefaultsToFactory} 
                                    className="btn-secondary text-[0.8rem] text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                                    title="Revert all role defaults back to factory built-in defaults"
                                >
                                    <RotateCcw size={13} className="inline mr-1" />
                                    Revert to Factory
                                </button>
                                <button 
                                    onClick={handleSaveRoleDefaults} 
                                    disabled={savingDefaults || !hasUnsavedDefaults}
                                    className={`text-[0.8rem] px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                                        hasUnsavedDefaults
                                            ? "bg-accent-primary hover:bg-accent-primary-hover text-white cursor-pointer shadow-accent-primary/20"
                                            : "bg-white/10 text-text-muted cursor-not-allowed"
                                    }`}
                                >
                                    {savingDefaults ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Saving Defaults...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            <span>Save Role Defaults {hasUnsavedDefaults && "•"}</span>
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center justify-between border-b border-border-color mb-5">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode("active")}
                            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent flex items-center gap-2 ${
                                viewMode === "active"
                                    ? "border-accent-primary text-text-primary"
                                    : "border-transparent text-text-secondary hover:text-text-primary"
                            }`}
                        >
                            <Shield size={14} className={viewMode === "active" ? "text-accent-primary" : "text-text-muted"} />
                            <span>Active Permissions Matrix</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-text-secondary">
                                Live
                            </span>
                        </button>

                        <button
                            onClick={() => setViewMode("defaults")}
                            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent flex items-center gap-2 ${
                                viewMode === "defaults"
                                    ? "border-amber-400 text-amber-300"
                                    : "border-transparent text-text-secondary hover:text-text-primary"
                            }`}
                        >
                            <Sliders size={14} className={viewMode === "defaults" ? "text-amber-400" : "text-text-muted"} />
                            <span>System Role Defaults</span>
                            {hasUnsavedDefaults ? (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-400 font-bold animate-pulse">
                                    Unsaved Changes
                                </span>
                            ) : (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-text-secondary">
                                    Authoritative
                                </span>
                            )}
                        </button>
                    </div>

                    {viewMode === "defaults" && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary pb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={applyDefaultsToActive}
                                    onChange={(e) => setApplyDefaultsToActive(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded text-accent-primary focus:ring-accent-primary"
                                />
                                <span>Also apply newly saved defaults to active permissions immediately</span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Status Banner */}
                {statusBanner && (
                    <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                            <span>{statusBanner.message}</span>
                        </div>
                        <button 
                            onClick={() => setStatusBanner(null)} 
                            className="text-emerald-400 hover:text-emerald-200 border-none bg-transparent cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Legend & Context Banner */}
                {viewMode === "active" ? (
                    <div className="flex flex-wrap gap-6 mb-5 py-3 px-4 bg-white/5 rounded-lg border border-border-color text-xs items-center justify-between">
                        <div className="flex flex-wrap items-center gap-5">
                            <span className="font-semibold text-text-secondary uppercase text-[10px] tracking-wider">Active Legend:</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-accent-primary"></span>
                                <span>Default Enabled</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-white/15 border border-white/30"></span>
                                <span>Default Disabled</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] border border-amber-400"></span>
                                <span className="text-amber-400 font-semibold">Modified from Role Default</span>
                            </div>
                        </div>

                        <span className="text-[11px] text-text-muted italic">
                            Click any cell to toggle live access. Changes are audited immediately.
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-6 mb-5 py-3 px-4 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-300">
                            <Sliders size={15} />
                            <span>
                                <strong>Role Defaults Editor:</strong> Modify baseline tools for each role. Click <strong>Save Role Defaults</strong> to persist changes.
                            </span>
                        </div>
                        {hasUnsavedDefaults && (
                            <span className="text-amber-400 font-bold bg-amber-500/20 px-2 py-0.5 rounded text-[11px]">
                                Unsaved Draft Edits Pending
                            </span>
                        )}
                    </div>
                )}

                {/* Debug info modal */}
                {showDebug && debugInfo && (
                    <div className="glass-card mb-6 p-4 bg-black/60 border border-accent-primary">
                        <div className="flex justify-between mb-4">
                            <h3 className="m-0 text-accent-primary">Production Safety Diagnostics</h3>
                            <button onClick={() => setShowDebug(false)} className="cursor-pointer">Close</button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6 text-[0.85rem]">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <strong className="text-text-secondary">Expected DB Path:</strong>
                                    <div className="font-mono bg-black p-1 rounded mt-1 text-xs">{debugInfo.absDbPath}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <strong>File Exists:</strong> 
                                    <span className="font-bold" style={{ color: debugInfo.dbFileExists ? '#4ade80' : '#f87171' }}>
                                        {debugInfo.dbFileExists ? 'YES' : 'NO (MISSING)'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="bg-white/5 p-2 rounded-lg">
                                    <div className="mb-1"><strong>Users found:</strong> {debugInfo.users?.length || 0}</div>
                                    <div className="mb-1"><strong>Permission records:</strong> {debugInfo.allPermissions?.length || 0}</div>
                                    <div className="text-[0.75rem] text-text-muted">Last Scan: {debugInfo.timestamp}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Technical logs */}
                {showLogs && (
                    <div className="glass-card mb-6 p-4 bg-black border border-accent-primary">
                        <div className="flex justify-between mb-3">
                            <h3 className="m-0 text-accent-primary">Server Logs</h3>
                            <button onClick={() => setShowLogs(false)} className="cursor-pointer">Close</button>
                        </div>
                        <pre className="m-0 whitespace-pre-wrap text-[0.75rem] text-green-400 font-mono max-h-[300px] overflow-y-auto bg-neutral-950 p-3 rounded">
                            {logs || "Loading logs..."}
                        </pre>
                    </div>
                )}

                {/* Reset Modal */}
                {showResetModal && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[1000] p-4">
                        <div className="max-w-[480px] w-full p-6 border border-accent-primary bg-neutral-950 rounded-[var(--radius-md)] shadow-2xl">
                            <div className="flex border-b border-border-color mb-5">
                                <button 
                                    onClick={() => setResetType("role")}
                                    className={`flex-1 p-2.5 bg-transparent border-none font-semibold cursor-pointer ${resetType === "role" ? "border-b-2 border-accent-primary text-text-primary" : "text-text-secondary"}`}
                                >
                                    Reset by Role
                                </button>
                                <button 
                                    onClick={() => setResetType("tool")}
                                    className={`flex-1 p-2.5 bg-transparent border-none font-semibold cursor-pointer ${resetType === "tool" ? "border-b-2 border-accent-primary text-text-primary" : "text-text-secondary"}`}
                                >
                                    Reset by Tool
                                </button>
                            </div>

                            {resetType === "role" ? (
                                <>
                                    <h3 className="mb-2">Reset Active Permissions by Role</h3>
                                    <p className="text-text-secondary text-xs mb-4">
                                        Select the roles you wish to reset to their configured role defaults.
                                    </p>

                                    <div className="grid grid-cols-2 gap-2.5 mb-6">
                                        {ROLES.map(role => (
                                            <label key={role} className="flex items-center gap-2.5 cursor-pointer p-2 bg-white/5 rounded-md text-xs">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedRolesForReset.includes(role)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedRolesForReset([...selectedRolesForReset, role]);
                                                        else setSelectedRolesForReset(selectedRolesForReset.filter(r => r !== role));
                                                    }}
                                                    className="w-4 h-4"
                                                />
                                                <span className="font-semibold">{role}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="mb-2">Reset Active Permissions by Tool</h3>
                                    <p className="text-text-secondary text-xs mb-4">
                                        Select the tools you wish to reset to role defaults across all roles.
                                    </p>

                                    <div className="grid grid-cols-2 gap-2 mb-6 max-h-[220px] overflow-y-auto pr-1">
                                        {TOOLS.map(tool => (
                                            <label key={tool.id} className="flex items-center gap-2 cursor-pointer p-1.5 bg-white/5 rounded-md text-xs">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedToolsForReset.includes(tool.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedToolsForReset([...selectedToolsForReset, tool.id]);
                                                        else setSelectedToolsForReset(selectedToolsForReset.filter(t => t !== tool.id));
                                                    }}
                                                    className="w-4 h-4"
                                                />
                                                <span className="font-medium truncate">{tool.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div className="flex justify-between gap-3 pt-4 border-t border-border-color">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            if (resetType === "role") setSelectedRolesForReset(ROLES);
                                            else setSelectedToolsForReset(TOOLS.map(t => t.id));
                                        }} 
                                        className="bg-transparent border-none text-accent-primary text-xs cursor-pointer hover:underline"
                                    >
                                        Select All
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (resetType === "role") setSelectedRolesForReset([]);
                                            else setSelectedToolsForReset([]);
                                        }} 
                                        className="bg-transparent border-none text-text-muted text-xs cursor-pointer hover:underline"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div className="flex gap-2.5">
                                    <button onClick={() => setShowResetModal(false)} className="btn-secondary text-xs">
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (resetType === "role") {
                                                if (selectedRolesForReset.length === 0) {
                                                    alert("Please select at least one role to reset.");
                                                    return;
                                                }
                                                handleResetActive(selectedRolesForReset, undefined);
                                            } else {
                                                if (selectedToolsForReset.length === 0) {
                                                    alert("Please select at least one tool to reset.");
                                                    return;
                                                }
                                                handleResetActive(undefined, selectedToolsForReset);
                                            }
                                        }} 
                                        className="btn-danger bg-red-800 text-xs"
                                        disabled={resetType === "role" ? selectedRolesForReset.length === 0 : selectedToolsForReset.length === 0}
                                    >
                                        Execute Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Matrix Table */}
            <div className="glass-card flex-1 flex flex-col min-h-0 p-0 overflow-hidden">
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead className="sticky-header">
                            <tr className="bg-white/5">
                                <th className="text-left p-3.5 border-b border-border-color text-xs font-bold uppercase tracking-wider text-text-secondary">
                                    Security Tool ({TOOLS.length})
                                </th>
                                {ROLES.map(role => (
                                    <th key={role} className="text-center p-3.5 border-b border-border-color text-xs font-bold uppercase tracking-wider text-text-secondary">
                                        {role}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TOOLS.map(tool => (
                                <tr key={tool.id} className="border-b border-border-color transition-colors duration-150 table-row-hover">
                                    <td className="p-3.5">
                                        <div>
                                            <div className="font-semibold text-text-primary text-xs">{tool.name}</div>
                                            <div className="text-[10px] text-text-muted font-mono">{tool.id}</div>
                                        </div>
                                    </td>
                                    {ROLES.map(role => {
                                        if (viewMode === "active") {
                                            const isValEnabled = isActiveEnabled(tool.id, role);
                                            const isValDefault = isActiveDefault(tool.id, role);
                                            const isSavingThis = saving === `${tool.id}-${role}`;

                                            return (
                                                <td key={role} className="text-center p-3">
                                                    <div className="flex flex-col items-center gap-1.5">
                                                        <button
                                                            onClick={() => toggleActivePermission(tool.id, role)}
                                                            disabled={isSavingThis || role === "ADMIN"}
                                                            className={`px-3.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all min-w-[95px] ${
                                                                role === "ADMIN" 
                                                                    ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40 cursor-default"
                                                                    : isValEnabled 
                                                                    ? 'bg-accent-primary text-white hover:bg-accent-primary-hover shadow-sm' 
                                                                    : 'bg-white/10 text-text-muted hover:bg-white/15'
                                                            } ${
                                                                !isValDefault && role !== "ADMIN"
                                                                    ? 'border-2 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]' 
                                                                    : 'border-none'
                                                            }`}
                                                            style={{ opacity: isSavingThis ? 0.6 : 1 }}
                                                        >
                                                            {isSavingThis ? '...' : (isValEnabled ? 'Enabled' : 'Disabled')}
                                                        </button>
                                                        
                                                        {role !== "ADMIN" && (
                                                            isValDefault ? (
                                                                <span className="text-[9px] py-0.5 px-1.5 rounded bg-white/5 text-text-muted font-mono">
                                                                    Default
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] py-0.5 px-1.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30 font-semibold font-mono">
                                                                    Modified
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        } else {
                                            // Defaults Mode
                                            const isDraftEnabled = draftDefaults[tool.id]?.[role] ?? false;
                                            const isFactoryEnabled = SYSTEM_DEFAULT_PERMISSIONS_MAP[tool.id]?.[role] ?? false;
                                            const isDifferentFromFactory = isDraftEnabled !== isFactoryEnabled;

                                            return (
                                                <td key={role} className="text-center p-3">
                                                    <div className="flex flex-col items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleToggleDraftDefault(tool.id, role)}
                                                            disabled={role === "ADMIN"}
                                                            className={`px-3.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all min-w-[95px] ${
                                                                role === "ADMIN"
                                                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default"
                                                                    : isDraftEnabled 
                                                                    ? 'bg-amber-400 text-black hover:bg-amber-300 font-bold shadow-sm' 
                                                                    : 'bg-white/10 text-text-muted hover:bg-white/20'
                                                            } ${
                                                                isDifferentFromFactory && role !== "ADMIN"
                                                                    ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-bg-surface' 
                                                                    : ''
                                                            }`}
                                                        >
                                                            {isDraftEnabled ? 'Def: ON' : 'Def: OFF'}
                                                        </button>

                                                        {role !== "ADMIN" && (
                                                            isDifferentFromFactory ? (
                                                                <span className="text-[9px] py-0.5 px-1.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 font-mono font-semibold" title="Custom default (differs from factory)">
                                                                    Custom Def
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] py-0.5 px-1.5 rounded bg-white/5 text-text-muted font-mono">
                                                                    Factory
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        }
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="shrink-0 mt-5 p-3.5 bg-sky-400/5 rounded-lg border border-sky-400/20 flex items-center justify-between text-xs text-text-secondary">
                <div>
                    <strong>Audit Notice:</strong> All permission changes, role default modifications, promotions, and resets are permanently recorded in the system audit log.
                </div>
                <div className="font-mono text-[11px] text-text-muted">
                    Roles: 7 | Tools: {TOOLS.length} | Total Combinations: {7 * TOOLS.length}
                </div>
            </div>
        </div>
    );
}
