import React, { useState, useMemo } from 'react';

interface SiteTableProps {
    parsedPreview: any[];
    actionLoading: boolean;
    performAction: (action: 'add' | 'update' | 'delete', siteData: any) => Promise<boolean>;
}

export function SiteTable({ parsedPreview, actionLoading, performAction }: SiteTableProps) {
    const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
    
    const [editingSiteCode, setEditingSiteCode] = useState<string | null>(null);
    const [editingSiteData, setEditingSiteData] = useState<any>({ name: "", address: "", status: "Active", notes: "" });

    const [sortField, setSortField] = useState<'code' | 'status'>('code');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const sortedSites = useMemo(() => {
        return [...parsedPreview].sort((a, b) => {
            if (sortField === 'code') {
                return sortDirection === 'asc' 
                    ? a.code.localeCompare(b.code) 
                    : b.code.localeCompare(a.code);
            } else {
                const statusA = a.status || 'Active';
                const statusB = b.status || 'Active';
                return sortDirection === 'asc' 
                    ? statusA.localeCompare(statusB) 
                    : statusB.localeCompare(statusA);
            }
        });
    }, [parsedPreview, sortField, sortDirection]);

    const handleEditClick = (site: any) => {
        setEditingSiteCode(site.code);
        setEditingSiteData({ code: site.code, name: site.name, address: site.address, status: site.status || "Active", notes: site.notes || "" });
    };

    const handleDeleteClick = async (code: string) => {
        if (!confirm(`Are you sure you want to delete site ${code}?`)) return;
        await performAction('delete', { code });
    };

    return (
        <>
            <div className="flex justify-end mb-4">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            const allExpanded: Record<string, boolean> = {};
                            parsedPreview.forEach((s: any) => { allExpanded[s.id] = true; });
                            setExpandedSites(allExpanded);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-muted hover:text-accent-primary cursor-pointer bg-transparent border-none"
                        title="Expand all rows"
                    >
                        Expand All
                    </button>
                    <button 
                        onClick={() => setExpandedSites({})}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-muted hover:text-accent-primary cursor-pointer bg-transparent border-none"
                        title="Collapse all rows"
                    >
                        Collapse All
                    </button>
                </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead className="sticky-header">
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '12px 8px', cursor: 'pointer', width: '140px' }} onClick={() => {
                            if (sortField === 'code') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                                setSortField('code');
                                setSortDirection('asc');
                            }
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Site Code {sortField === 'code' ? <span className="text-accent-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span> : <span style={{ opacity: 0.3 }}>↕</span>}
                            </div>
                        </th>
                        <th style={{ padding: '12px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Site Name / Summary</div>
                        </th>
                        <th style={{ padding: '12px 8px', cursor: 'pointer', width: '140px' }} onClick={() => {
                            if (sortField === 'status') {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                            } else {
                                setSortField('status');
                                setSortDirection('asc');
                            }
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                Status {sortField === 'status' ? <span className="text-accent-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span> : <span style={{ opacity: 0.3 }}>↕</span>}
                            </div>
                        </th>
                        <th style={{ padding: '12px 8px', textAlign: 'right', width: '120px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedSites.map((s: any) => {
                        const isEditing = editingSiteCode === s.code;
                        
                        if (isEditing) {
                            return (
                                <tr key={s.id} style={{ borderBottom: '2px solid var(--accent-primary)', backgroundColor: 'transparent' }}>
                                    <td colSpan={4} style={{ padding: '12px 0' }}>
                                        <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-surface)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                                                <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)' }}>{s.code}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Inline Editor</span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                    <div style={{ width: '130px' }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Site Code</label>
                                                        <input 
                                                            type="text" 
                                                            value={editingSiteData.code !== undefined ? editingSiteData.code : s.code} 
                                                            onChange={e => setEditingSiteData({...editingSiteData, code: e.target.value})}
                                                            style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 700 }}
                                                            placeholder="CODE"
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: '180px' }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Site Name</label>
                                                        <input 
                                                            type="text" 
                                                            value={editingSiteData.name} 
                                                            onChange={e => setEditingSiteData({...editingSiteData, name: e.target.value})}
                                                            style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem' }}
                                                            placeholder="Site Name"
                                                        />
                                                    </div>
                                                    <div style={{ width: '130px' }}>
                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Status</label>
                                                        <select 
                                                            value={editingSiteData.status} 
                                                            onChange={e => setEditingSiteData({...editingSiteData, status: e.target.value})}
                                                            style={{ 
                                                                width: '100%', 
                                                                padding: '6px 10px', 
                                                                background: '#000', 
                                                                border: '1px solid var(--border-color)', 
                                                                borderRadius: '6px', 
                                                                color: editingSiteData.status === 'Retired' ? '#f87171' : editingSiteData.status === 'Future' ? '#facc15' : '#4ade80', 
                                                                fontSize: '0.9rem', 
                                                                fontWeight: 700 
                                                            }}
                                                        >
                                                            <option value="Active" style={{ color: '#4ade80' }}>Active</option>
                                                            <option value="Future" style={{ color: '#facc15' }}>Future</option>
                                                            <option value="Retired" style={{ color: '#f87171' }}>Retired</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Address</label>
                                                    <textarea 
                                                        rows={1}
                                                        value={editingSiteData.address} 
                                                        onChange={e => setEditingSiteData({...editingSiteData, address: e.target.value})}
                                                        style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', lineHeight: '1.3' }}
                                                        placeholder="Full Address"
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Notes</label>
                                                    <textarea 
                                                        rows={2}
                                                        value={editingSiteData.notes} 
                                                        onChange={e => setEditingSiteData({...editingSiteData, notes: e.target.value})}
                                                        style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', lineHeight: '1.3' }}
                                                        placeholder="Notes"
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                                                <button 
                                                    onClick={() => setEditingSiteCode(null)} 
                                                    disabled={actionLoading}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={async () => {
                                                        const success = await performAction('update', { 
                                                            oldCode: s.code, 
                                                            code: editingSiteData.code !== undefined ? editingSiteData.code : s.code, 
                                                            ...editingSiteData 
                                                        });
                                                        if (success) {
                                                            setEditingSiteCode(null);
                                                        }
                                                    }} 
                                                    disabled={actionLoading}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                                >
                                                    {actionLoading ? "Saving..." : "Save"}
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }

                        const rawStatus = s.status || 'Active';
                        const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
                        const statusColorHex = 
                            formattedStatus === 'Active' ? '#4ade80' :
                            formattedStatus === 'Retired' ? '#f87171' :
                            '#facc15';

                        const isExpanded = !!expandedSites[s.id];
                        const toggleExpand = () => {
                            setExpandedSites(prev => ({ ...prev, [s.id]: !prev[s.id] }));
                        };

                        return (
                            <React.Fragment key={s.id}>
                                <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 8px' }}>
                                        <div 
                                            onClick={toggleExpand}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                            className="group"
                                            title="Click to expand/collapse details"
                                        >
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                ▶
                                            </span>
                                            <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)' }} className="uppercase tracking-wider group-hover:underline">
                                                {s.code}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        <div className="flex items-center gap-2">
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.name}</span>
                                            {!isExpanded && s.address && (
                                                <span className="text-xs text-text-muted truncate max-w-xs">
                                                    • {s.address}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            color: statusColorHex,
                                            border: `1px solid ${statusColorHex}33`
                                        }}>
                                            {formattedStatus}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2 items-center">
                                            <button 
                                                onClick={() => handleEditClick(s)} 
                                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}
                                                className="nav-link"
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteClick(s.code)} 
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}
                                                className="nav-link"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && (
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                        <td colSpan={4} style={{ padding: '8px 12px 16px 32px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px' }}>Address</span>
                                                    <span style={{ fontSize: '0.85rem', color: s.address ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                                        {s.address || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No physical address specified</span>}
                                                    </span>
                                                </div>
                                                {s.notes && (
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px', marginTop: '2px' }}>Notes</span>
                                                        <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px', borderLeft: '2px solid var(--accent-primary)' }}>
                                                            {s.notes}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {sortedSites.length === 0 && (
                        <tr>
                            <td colSpan={4} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No sites configured yet. Upload a CSV or add a site mapping above!
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </>
    );
}
