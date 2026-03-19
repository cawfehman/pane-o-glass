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
    { id: 'hibp-account', name: 'HIBP Account Security' },
    { id: 'hibp-domain', name: 'HIBP Domain Security' },
];

const ROLES = ["ADMIN", "ANALYST", "NETWORK", "DESKTOP", "USER"];

export default function PermissionsPage() {
    const router = useRouter();
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [showDebug, setShowDebug] = useState(false);
    const [logs, setLogs] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        loadPermissions();
    }, []);

    const loadPermissions = async () => {
        const data = await getToolPermissions();
        setPermissions(data);
        setLoading(false);
    };

    const handleReset = async () => {
        if (!confirm("Are you sure you want to reset ALL permissions to defaults?")) return;
        setLoading(true);
        try {
            await resetPermissions();
            router.refresh();
            await loadPermissions();
            alert("Permissions reset successfully!");
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
                        <button onClick={handleReset} className="btn-danger" style={{ fontSize: '0.8rem', background: '#991b1b' }}>
                            Reset Defaults
                        </button>
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
                                    {ROLES.map(role => (
                                        <td key={role} style={{ textAlign: 'center', padding: '16px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    onClick={() => togglePermission(tool.id, role)}
                                                    disabled={saving === `${tool.id}-${role}`}
                                                    style={{
                                                        background: isEnabled(tool.id, role) ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                                                        color: isEnabled(tool.id, role) ? '#000' : 'var(--text-muted)',
                                                        border: 'none',
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
                                                    {saving === `${tool.id}-${role}` ? '...' : (isEnabled(tool.id, role) ? 'Enabled' : 'Disabled')}
                                                </button>
                                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: '120px', overflow: 'hidden' }}>
                                                    {getRawData(tool.id, role)}
                                                </div>
                                            </div>
                                        </td>
                                    ))}
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
