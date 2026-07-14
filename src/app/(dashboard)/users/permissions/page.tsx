"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
    getToolPermissions, 
    updateToolPermission, 
    getPermissionsDiagnostic, 
    resetPermissions,
    getInternalLogs
} from "@/app/actions/permissions";

const TOOLS = [
    { id: 'firewall', name: 'Cisco Firewall' },
    { id: 'ise', name: 'Cisco ISE Center' },
    { id: 'ise-tacacs', name: 'Cisco ISE TACACS' },
    { id: 'vpn', name: 'VPN Troubleshooting' },
    { id: 'hibp-account', name: 'HIBP Account Security' },
    { id: 'hibp-domain', name: 'HIBP Domain Security' },
    { id: 'vectra', name: 'Vectra Forensic Analysis' },
    { id: 'site-management', name: 'Site Metadata Directory' },
    { id: 'threat-intel', name: 'Threat Intelligence reputation' },
];

const ROLES = ["ADMIN", "ANALYST", "NETWORK", "DESKTOP", "SYSTEMS", "USER"];

// System default mapping to compare against active database configuration
const DEFAULT_PERMISSIONS_MAP: Record<string, Record<string, boolean>> = {
    'firewall': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: true, SYSTEMS: false, USER: false },
    'ise': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false },
    'ise-tacacs': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false },
    'vpn': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false },
    'hibp-account': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: true, SYSTEMS: true, USER: true },
    'hibp-domain': { ADMIN: true, ANALYST: false, NETWORK: false, DESKTOP: false, SYSTEMS: true, USER: false },
    'vectra': { ADMIN: true, ANALYST: true, NETWORK: false, DESKTOP: false, SYSTEMS: false, USER: false },
    'site-management': { ADMIN: true, ANALYST: false, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false },
    'threat-intel': { ADMIN: true, ANALYST: true, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false }
};

export default function PermissionsPage() {
    const router = useRouter();
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [logs, setLogs] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [selectedRolesForReset, setSelectedRolesForReset] = useState<string[]>([]);
    const [selectedToolsForReset, setSelectedToolsForReset] = useState<string[]>([]);
    const [resetType, setResetType] = useState<"role" | "tool">("role");

    useEffect(() => {
        loadPermissions();
    }, []);

    const loadPermissions = async () => {
        const data = await getToolPermissions();
        setPermissions(data);
        setLoading(false);
    };

    const handleReset = async (roles?: string[], tools?: string[]) => {
        setLoading(true);
        try {
            await resetPermissions(roles, tools);
            router.refresh();
            await loadPermissions();
            setShowResetModal(false);
            if (roles) {
                alert(`Permissions reset successfully for roles: ${roles.join(', ')}!`);
            } else if (tools) {
                const toolNames = tools.map(tid => TOOLS.find(t => t.id === tid)?.name || tid);
                alert(`Permissions reset successfully for tools: ${toolNames.join(', ')}!`);
            } else {
                alert("Permissions reset successfully to system defaults!");
            }
        } catch (err: any) {
            alert("Failed to reset: " + err.message);
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

    const togglePermission = async (toolId: string, role: string) => {
        const current = permissions.find((p: any) => p.toolId === toolId && p.role === role);
        const newState = current ? !current.isEnabled : true;
        
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
            // Final sync
            await loadPermissions();
        } catch (err: any) {
            alert("Failed to update: " + err.message);
            await loadPermissions(); // Revert
        } finally {
            setSaving(null);
        }
    };

    const isEnabled = (toolId: string, role: string) => {
        const p = permissions.find((per: any) => per.toolId === toolId && per.role === role);
        return p ? p.isEnabled : false;
    };

    const isDefault = (toolId: string, role: string) => {
        const currentEnabled = isEnabled(toolId, role);
        const defaultEnabled = DEFAULT_PERMISSIONS_MAP[toolId]?.[role] ?? false;
        return currentEnabled === defaultEnabled;
    };

    const getRawData = (toolId: string, role: string) => {
        const p = permissions.find((per: any) => per.toolId === toolId && per.role === role);
        return p ? JSON.stringify(p) : "Not in DB";
    };

    if (loading && permissions.length === 0) return <div className="p-8">Loading tool configuration...</div>;

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1>Tool Permissions</h1>
                        <p className="text-text-secondary">Control which roles can access specific security tools.</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={viewLogs} className="btn-secondary text-[0.8rem] bg-white/5">
                            View Technical Logs
                        </button>
                        <button onClick={runDiagnostics} className="btn-secondary text-[0.8rem]">
                            Server Diagnostics
                        </button>
                        <button onClick={() => {
                            setSelectedRolesForReset([]);
                            setSelectedToolsForReset([]);
                            setResetType("role");
                            setShowResetModal(true);
                        }} className="btn-danger text-[0.8rem] bg-red-800">
                            Reset Defaults
                        </button>
                    </div>
                </div>

                {/* Permissions Legend */}
                <div className="flex flex-wrap gap-6 mb-6 py-4 px-5 bg-white/5 rounded-lg border border-border-color text-[0.85rem] items-center">
                    <span className="font-semibold text-text-secondary">LEGEND:</span>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-accent-primary"></span>
                        <span>Default Enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-white/15 border border-white/30"></span>
                        <span>Default Disabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] border border-amber-400"></span>
                        <span className="text-amber-400 font-semibold">Modified / Overridden State</span>
                    </div>
                </div>

                {showDebug && debugInfo && (
                    <div className="glass-card mb-8 p-4 bg-black/60 border border-accent-primary">
                        <div className="flex justify-between mb-4">
                            <h3 className="m-0 text-accent-primary">Production Safety Diagnostics</h3>
                            <button onClick={() => setShowDebug(false)}>Close</button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6 text-[0.85rem]">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <strong className="text-text-secondary">Current Working Dir:</strong>
                                    <div className="font-mono bg-black p-1 rounded mt-1">{debugInfo.cwd}</div>
                                </div>
                                <div>
                                    <strong className="text-text-secondary">Expected DB Path:</strong>
                                    <div className="font-mono bg-black p-1 rounded mt-1">{debugInfo.absDbPath}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <strong>File Exists:</strong> 
                                    <span className="font-bold" style={{ color: debugInfo.dbFileExists ? '#4ade80' : '#f87171' }}>
                                        {debugInfo.dbFileExists ? 'YES' : 'NO (MISSING)'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div>
                                    <strong className="text-text-secondary">DATABASE_URL Env:</strong>
                                    <div className="font-mono bg-black p-1 rounded mt-1">{debugInfo.databaseUrl}</div>
                                </div>
                                <div className="bg-white/5 p-2 rounded-lg">
                                    <div className="mb-1"><strong>Users found:</strong> {debugInfo.users?.length || 0}</div>
                                    <div className="mb-1"><strong>Permission records:</strong> {debugInfo.allPermissions?.length || 0}</div>
                                    <div className="text-[0.75rem] text-text-muted">Last Scan: {debugInfo.timestamp}</div>
                                </div>
                            </div>
                        </div>
                        
                        {debugInfo.error && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500 rounded text-red-300">
                                <div className="font-bold mb-1">Connection Error:</div>
                                <pre className="m-0 whitespace-pre-wrap text-[0.75rem]">{debugInfo.error}</pre>
                                {debugInfo.stack && <pre className="mt-2 text-[0.65rem] opacity-70">{debugInfo.stack}</pre>}
                            </div>
                        )}
                    </div>
                )}

                {showLogs && (
                    <div className="glass-card mb-8 p-4 bg-black border border-accent-primary">
                        <div className="flex justify-between mb-3">
                            <h3 className="m-0 text-accent-primary">Full Server Logs (Last 100 lines)</h3>
                            <button onClick={() => setShowLogs(false)}>Close</button>
                        </div>
                        <pre className="m-0 whitespace-pre-wrap text-[0.75rem] text-green-400 font-mono max-h-[400px] overflow-y-auto bg-neutral-950 p-3">
                            {logs || "Loading logs..."}
                        </pre>
                    </div>
                )}

                {showResetModal && (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[1000] p-4">
                        <div className="max-w-[450px] w-full p-6 border border-accent-primary bg-neutral-950 rounded-[var(--radius-md)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                            
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
                                    <h3 className="mb-2">Reset Role Defaults</h3>
                                    <p className="text-text-secondary text-[0.9rem] mb-6">
                                        Select the roles you wish to reset to their original system defaults. Other roles will remain unchanged.
                                    </p>

                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {ROLES.map(role => (
                                            <label key={role} className="flex items-center gap-2.5 cursor-pointer p-2 bg-white/5 rounded-md">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedRolesForReset.includes(role)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedRolesForReset([...selectedRolesForReset, role]);
                                                        else setSelectedRolesForReset(selectedRolesForReset.filter(r => r !== role));
                                                    }}
                                                    className="w-[18px] h-[18px]"
                                                />
                                                <span className="font-medium">{role}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="mb-2">Reset Tool Defaults</h3>
                                    <p className="text-text-secondary text-[0.9rem] mb-6">
                                        Select the tools you wish to reset to their original system defaults across all roles. Other tools will remain unchanged.
                                    </p>

                                    <div className="grid grid-cols-2 gap-3 mb-6 max-h-[200px] overflow-y-auto pr-1">
                                        {TOOLS.map(tool => (
                                            <label key={tool.id} className="flex items-center gap-2.5 cursor-pointer p-2 bg-white/5 rounded-md">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedToolsForReset.includes(tool.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedToolsForReset([...selectedToolsForReset, tool.id]);
                                                        else setSelectedToolsForReset(selectedToolsForReset.filter(t => t !== tool.id));
                                                    }}
                                                    className="w-[18px] h-[18px]"
                                                />
                                                <span className="font-medium">{tool.name}</span>
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
                                        className="bg-transparent border-none text-accent-primary text-[0.8rem] cursor-pointer"
                                    >
                                        Select All
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (resetType === "role") setSelectedRolesForReset([]);
                                            else setSelectedToolsForReset([]);
                                        }} 
                                        className="bg-transparent border-none text-text-muted text-[0.8rem] cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setShowResetModal(false)} className="btn-secondary">Cancel</button>
                                    <button 
                                        onClick={() => {
                                            if (resetType === "role") {
                                                if (selectedRolesForReset.length === 0) {
                                                    alert("Please select at least one role to reset.");
                                                    return;
                                                }
                                                if (confirm(`Are you sure you want to reset ${selectedRolesForReset.length === ROLES.length ? 'ALL roles' : `the roles: ${selectedRolesForReset.join(', ')}`} to defaults?`)) {
                                                    handleReset(selectedRolesForReset, undefined);
                                                }
                                            } else {
                                                if (selectedToolsForReset.length === 0) {
                                                    alert("Please select at least one tool to reset.");
                                                    return;
                                                }
                                                const toolNames = selectedToolsForReset.map(tid => TOOLS.find(t => t.id === tid)?.name || tid);
                                                if (confirm(`Are you sure you want to reset ${selectedToolsForReset.length === TOOLS.length ? 'ALL tools' : `the tools: ${toolNames.join(', ')}`} to defaults?`)) {
                                                    handleReset(undefined, selectedToolsForReset);
                                                }
                                            }
                                        }} 
                                        className="btn-danger bg-red-800"
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

            <div className="glass-card flex-1 flex flex-col min-h-0 p-0 overflow-hidden">
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead className="sticky-header">
                            <tr className="bg-white/5">
                                <th className="text-left p-4 border-b border-border-color">Security Tool</th>
                                {ROLES.map(role => (
                                    <th key={role} className="text-center p-4 border-b border-border-color">
                                        {role}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TOOLS.map(tool => (
                                <tr key={tool.id} className="border-b border-border-color transition-colors duration-200 table-row-hover">
                                    <td className="p-4">
                                        <div>
                                            <div className="font-semibold">{tool.name}</div>
                                            <div className="text-[0.75rem] text-text-muted">{tool.id}</div>
                                        </div>
                                    </td>
                                    {ROLES.map(role => {
                                        const isValEnabled = isEnabled(tool.id, role);
                                        const isValDefault = isDefault(tool.id, role);
                                        return (
                                            <td key={role} className="text-center p-4">
                                                <div className="flex flex-col items-center gap-2">
                                                    <button
                                                        onClick={() => togglePermission(tool.id, role)}
                                                        disabled={saving === `${tool.id}-${role}`}
                                                        className={`px-4 py-1.5 rounded-full text-[0.8rem] font-semibold cursor-pointer transition-all duration-200 min-w-[100px] ${
                                                            isValEnabled 
                                                                ? 'bg-accent-primary text-black' 
                                                                : 'bg-white/10 text-text-muted'
                                                        } ${
                                                            isValDefault 
                                                                ? 'border-none shadow-none' 
                                                                : 'border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                                                        }`}
                                                        style={{
                                                            opacity: saving === `${tool.id}-${role}` ? 0.5 : 1
                                                        }}
                                                    >
                                                        {saving === `${tool.id}-${role}` ? '...' : (isValEnabled ? 'Enabled' : 'Disabled')}
                                                    </button>
                                                    
                                                    {/* State indicator label */}
                                                    {isValDefault ? (
                                                        <span className="text-[9px] py-[2px] px-1.5 rounded bg-white/5 text-text-muted font-mono">
                                                            Default
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] py-[2px] px-1.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30 font-semibold font-mono shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
                                                            Modified
                                                        </span>
                                                    )}

                                                    <div className="text-[8px] text-text-muted opacity-50 font-mono max-w-[120px] overflow-hidden">
                                                        {getRawData(tool.id, role)}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="shrink-0 mt-6 p-4 bg-sky-400/5 rounded-lg border border-sky-400/20">
                <p className="m-0 text-sm text-text-secondary">
                    <strong>Note:</strong> Changes take effect for non-admin users immediately. Current Admin state is tracked via the session.
                </p>
            </div>
        </div>
    );
}
