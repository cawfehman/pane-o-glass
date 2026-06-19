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
    'site-management': { ADMIN: true, ANALYST: false, NETWORK: true, DESKTOP: false, SYSTEMS: false, USER: false }
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

    useEffect(() => {
        loadPermissions();
    }, []);

    const loadPermissions = async () => {
        const data = await getToolPermissions();
        setPermissions(data);
        setLoading(false);
    };

    const handleReset = async (roles?: string[]) => {
        setLoading(true);
        try {
            await resetPermissions(roles);
            router.refresh();
            await loadPermissions();
            setShowResetModal(false);
            alert(`Permissions reset successfully${roles ? ` for: ${roles.join(', ')}` : ''}!`);
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
            <div style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                    <div>
                        <h1>Tool Permissions</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Control which roles can access specific security tools.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={viewLogs} className="btn-secondary" style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}>
                            View Technical Logs
                        </button>
                        <button onClick={runDiagnostics} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                            Server Diagnostics
                        </button>
                        <button onClick={() => {
                            setSelectedRolesForReset([]);
                            setShowResetModal(true);
                        }} className="btn-danger" style={{ fontSize: '0.8rem', background: '#991b1b' }}>
                            Reset Defaults
                        </button>
                    </div>
                </div>

                {/* Permissions Legend */}
                <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: '24px', 
                    marginBottom: '24px', 
                    padding: '16px 20px', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)', 
                    fontSize: '0.85rem',
                    alignItems: 'center'
                }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>LEGEND:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                        <span>Default Enabled</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}></span>
                        <span>Default Disabled</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            background: '#fbbf24', 
                            boxShadow: '0 0 8px rgba(251, 191, 36, 0.8)',
                            border: '1px solid #fbbf24'
                        }}></span>
                        <span style={{ color: '#fbbf24', fontWeight: 600 }}>Modified / Overridden State</span>
                    </div>
                </div>

                {showDebug && debugInfo && (
                    <div className="glass-card" style={{ marginBottom: '32px', padding: '16px', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--accent-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>Production Safety Diagnostics</h3>
                            <button onClick={() => setShowDebug(false)}>Close</button>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <strong style={{ color: 'var(--text-secondary)' }}>Current Working Dir:</strong>
                                    <div style={{ fontFamily: 'monospace', background: '#000', padding: '4px', borderRadius: '4px', marginTop: '4px' }}>{debugInfo.cwd}</div>
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--text-secondary)' }}>Expected DB Path:</strong>
                                    <div style={{ fontFamily: 'monospace', background: '#000', padding: '4px', borderRadius: '4px', marginTop: '4px' }}>{debugInfo.absDbPath}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <strong>File Exists:</strong> 
                                    <span style={{ color: debugInfo.dbFileExists ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                                        {debugInfo.dbFileExists ? 'YES' : 'NO (MISSING)'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <strong style={{ color: 'var(--text-secondary)' }}>DATABASE_URL Env:</strong>
                                    <div style={{ fontFamily: 'monospace', background: '#000', padding: '4px', borderRadius: '4px', marginTop: '4px' }}>{debugInfo.databaseUrl}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                                    <div style={{ marginBottom: '4px' }}><strong>Users found:</strong> {debugInfo.users?.length || 0}</div>
                                    <div style={{ marginBottom: '4px' }}><strong>Permission records:</strong> {debugInfo.allPermissions?.length || 0}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last Scan: {debugInfo.timestamp}</div>
                                </div>
                            </div>
                        </div>
                        
                        {debugInfo.error && (
                            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '4px', color: '#fca5a5' }}>
                                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Connection Error:</div>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>{debugInfo.error}</pre>
                                {debugInfo.stack && <pre style={{ marginTop: '8px', fontSize: '0.65rem', opacity: 0.7 }}>{debugInfo.stack}</pre>}
                            </div>
                        )}
                    </div>
                )}

                {showLogs && (
                    <div className="glass-card" style={{ marginBottom: '32px', padding: '16px', background: '#000', border: '1px solid var(--accent-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>Full Server Logs (Last 100 lines)</h3>
                            <button onClick={() => setShowLogs(false)}>Close</button>
                        </div>
                        <pre style={{ 
                            margin: 0, 
                            whiteSpace: 'pre-wrap', 
                            fontSize: '0.75rem', 
                            color: '#4ade80', 
                            fontFamily: 'monospace',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            background: '#0a0a0a',
                            padding: '12px'
                        }}>
                            {logs || "Loading logs..."}
                        </pre>
                    </div>
                )}

                {showResetModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                        <div style={{ maxWidth: '450px', width: '100%', padding: '24px', border: '1px solid var(--accent-primary)', background: '#0a0a0a', borderRadius: 'var(--radius-md)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                            <h3 style={{ marginBottom: '8px' }}>Reset Role Defaults</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                                Select the roles you wish to reset to their original system defaults. Other roles will remain unchanged.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                                {ROLES.map(role => (
                                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedRolesForReset.includes(role)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedRolesForReset([...selectedRolesForReset, role]);
                                                else setSelectedRolesForReset(selectedRolesForReset.filter(r => r !== role));
                                            }}
                                            style={{ width: '18px', height: '18px' }}
                                        />
                                        <span style={{ fontWeight: 500 }}>{role}</span>
                                    </label>
                                ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => setSelectedRolesForReset(ROLES)} 
                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Select All
                                    </button>
                                    <button 
                                        onClick={() => setSelectedRolesForReset([])} 
                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button onClick={() => setShowResetModal(false)} className="btn-secondary">Cancel</button>
                                    <button 
                                        onClick={() => {
                                            if (selectedRolesForReset.length === 0) {
                                                alert("Please select at least one role to reset.");
                                                return;
                                            }
                                            if (confirm(`Are you sure you want to reset ${selectedRolesForReset.length === ROLES.length ? 'ALL roles' : `the roles: ${selectedRolesForReset.join(', ')}`} to defaults?`)) {
                                                handleReset(selectedRolesForReset);
                                            }
                                        }} 
                                        className="btn-danger"
                                        disabled={selectedRolesForReset.length === 0}
                                        style={{ background: '#991b1b' }}
                                    >
                                        Execute Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead className="sticky-header">
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>Security Tool</th>
                                {ROLES.map(role => (
                                    <th key={role} style={{ textAlign: 'center', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                        {role}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TOOLS.map(tool => (
                                <tr key={tool.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="table-row-hover">
                                    <td style={{ padding: '16px' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{tool.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tool.id}</div>
                                        </div>
                                    </td>
                                    {ROLES.map(role => {
                                        const isValEnabled = isEnabled(tool.id, role);
                                        const isValDefault = isDefault(tool.id, role);
                                        return (
                                            <td key={role} style={{ textAlign: 'center', padding: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                        onClick={() => togglePermission(tool.id, role)}
                                                        disabled={saving === `${tool.id}-${role}`}
                                                        style={{
                                                            background: isValEnabled 
                                                                ? 'var(--accent-primary)' 
                                                                : 'rgba(255,255,255,0.1)',
                                                            color: isValEnabled ? '#000' : 'var(--text-muted)',
                                                            border: isValDefault 
                                                                ? 'none' 
                                                                : '2px solid #fbbf24',
                                                            boxShadow: isValDefault 
                                                                ? 'none' 
                                                                : '0 0 10px rgba(251, 191, 36, 0.4)',
                                                            padding: '6px 16px',
                                                            borderRadius: '20px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            opacity: saving === `${tool.id}-${role}` ? 0.5 : 1,
                                                            transition: 'all 0.2s',
                                                            minWidth: '100px'
                                                        }}
                                                    >
                                                        {saving === `${tool.id}-${role}` ? '...' : (isValEnabled ? 'Enabled' : 'Disabled')}
                                                    </button>
                                                    
                                                    {/* State indicator label */}
                                                    {isValDefault ? (
                                                        <span style={{ 
                                                            fontSize: '9px', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '4px', 
                                                            background: 'rgba(255,255,255,0.05)', 
                                                            color: 'var(--text-muted)',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            Default
                                                        </span>
                                                    ) : (
                                                        <span style={{ 
                                                            fontSize: '9px', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '4px', 
                                                            background: 'rgba(251, 191, 36, 0.15)', 
                                                            color: '#fbbf24', 
                                                            border: '1px solid rgba(251, 191, 36, 0.3)',
                                                            fontWeight: 600,
                                                            fontFamily: 'monospace',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                        }}>
                                                            Modified
                                                        </span>
                                                    )}

                                                    <div style={{ fontSize: '8px', color: 'var(--text-muted)', opacity: 0.5, fontFamily: 'monospace', maxWidth: '120px', overflow: 'hidden' }}>
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
            
            <div style={{ flexShrink: 0, marginTop: '24px', padding: '16px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <strong>Note:</strong> Changes take effect for non-admin users immediately. Current Admin state is tracked via the session.
                </p>
            </div>
        </div>
    );
}
