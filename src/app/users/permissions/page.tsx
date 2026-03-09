"use client";

import React, { useEffect, useState } from "react";
import { getToolPermissions, updateToolPermission } from "@/app/actions/permissions";

const TOOLS = [
    { id: 'firewall', name: 'Cisco Firewall' },
    { id: 'ise', name: 'Cisco ISE' },
    { id: 'ise-failures', name: 'ISE Auth Failures' },
    { id: 'hibp-account', name: 'HIBP Account Security' },
    { id: 'hibp-domain', name: 'HIBP Domain Security' },
];

const ROLES = ["ADMIN", "ANALYST", "USER"];

export default function PermissionsPage() {
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        loadPermissions();
    }, []);

    const loadPermissions = async () => {
        const data = await getToolPermissions();
        setPermissions(data);
        setLoading(false);
    };

    const togglePermission = async (toolId: string, role: string) => {
        const current = permissions.find(p => p.toolId === toolId && p.role === role);
        const newState = current ? !current.isEnabled : true;
        
        setSaving(`${toolId}-${role}`);
        try {
            await updateToolPermission(toolId, role, newState);
            await loadPermissions();
        } catch (err) {
            console.error("Failed to update permission", err);
        } finally {
            setSaving(null);
        }
    };

    const isEnabled = (toolId: string, role: string) => {
        const p = permissions.find(per => per.toolId === toolId && per.role === role);
        return p ? p.isEnabled : false;
    };

    if (loading) return <div className="p-8">Loading permissions...</div>;

    return (
        <div className="p-8">
            <div style={{ marginBottom: '32px' }}>
                <h1>Tool Permissions</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Control which roles can access specific security tools.</p>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <tr>
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
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {tool.id}</div>
                                    </div>
                                </td>
                                {ROLES.map(role => (
                                    <td key={role} style={{ textAlign: 'center', padding: '16px' }}>
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
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {saving === `${tool.id}-${role}` ? '...' : (isEnabled(tool.id, role) ? 'Enabled' : 'Disabled')}
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <strong>Note:</strong> Changes take effect immediately. Administrators always retain access to the permissions management settings.
                </p>
            </div>
        </div>
    );
}
