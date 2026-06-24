"use client";

import React, { useState, useMemo } from "react";
import { updateUser, deleteUser } from "@/app/actions/users";

export default function UserTableClient({ initialUsers }: { initialUsers: any[] }) {
    const [users, setUsers] = useState(initialUsers);
    const [sortField, setSortField] = useState<string>("username");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingUserData, setEditingUserData] = useState<any>({
        username: "",
        firstName: "",
        lastName: "",
        role: "USER",
        isExternal: false
    });
    const [actionLoading, setActionLoading] = useState(false);

    // Common sense interactive client sorting
    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => {
            let aValue = a[sortField] || "";
            let bValue = b[sortField] || "";

            if (sortField === "name") {
                aValue = `${a.firstName || ""} ${a.lastName || ""}`.trim();
                bValue = `${b.firstName || ""} ${b.lastName || ""}`.trim();
            }

            if (sortField === "lastLogin" || sortField === "createdAt") {
                const aTime = a[sortField] ? new Date(a[sortField]).getTime() : 0;
                const bTime = b[sortField] ? new Date(b[sortField]).getTime() : 0;
                return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
            }

            if (typeof aValue === "string") {
                return sortDirection === "asc"
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            return 0;
        });
    }, [users, sortField, sortDirection]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const startEdit = (user: any) => {
        setEditingUserId(user.id);
        setEditingUserData({
            username: user.username || "",
            password: "",
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            role: user.role || "USER",
            isExternal: !!user.isExternal,
            isRoleOverridden: !!user.isRoleOverridden
        });
    };

    const handleSave = async (id: string) => {
        setActionLoading(true);
        try {
            const formData = new FormData();
            formData.append("username", editingUserData.username);
            if (editingUserData.password) {
                formData.append("password", editingUserData.password);
            }
            formData.append("firstName", editingUserData.firstName);
            formData.append("lastName", editingUserData.lastName);
            formData.append("role", editingUserData.role);
            formData.append("isExternal", editingUserData.isExternal ? "on" : "off");
            formData.append("isRoleOverridden", editingUserData.isRoleOverridden ? "on" : "off");

            await updateUser(id, formData);
            
            // Update local state instantly
            setUsers(prev => prev.map(u => {
                if (u.id === id) {
                    return {
                        ...u,
                        username: editingUserData.username,
                        firstName: editingUserData.firstName || null,
                        lastName: editingUserData.lastName || null,
                        role: editingUserData.role,
                        isExternal: editingUserData.isExternal,
                        isRoleOverridden: editingUserData.isRoleOverridden
                    };
                }
                return u;
            }));
            setEditingUserId(null);
        } catch (err) {
            alert("Failed to update user record.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this account?")) return;
        try {
            await deleteUser(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err: any) {
            alert(err.message || "Failed to delete user.");
        }
    };

    const renderIndicator = (field: string) => {
        if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
        return <span style={{ color: "var(--accent-primary)" }}>{sortDirection === "asc" ? "↑" : "↓"}</span>;
    };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead className="sticky-header">
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 8px', cursor: 'pointer' }} onClick={() => handleSort('username')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Username {renderIndicator('username')}</div>
                    </th>
                    <th style={{ padding: '12px 8px', cursor: 'pointer' }} onClick={() => handleSort('name')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Name {renderIndicator('name')}</div>
                    </th>
                    <th style={{ padding: '12px 8px', cursor: 'pointer' }} onClick={() => handleSort('role')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Role {renderIndicator('role')}</div>
                    </th>
                    <th style={{ padding: '12px 8px', cursor: 'pointer' }} onClick={() => handleSort('lastLogin')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Last Login {renderIndicator('lastLogin')}</div>
                    </th>
                    <th style={{ padding: '12px 8px', cursor: 'pointer' }} onClick={() => handleSort('createdAt')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Created At {renderIndicator('createdAt')}</div>
                    </th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {sortedUsers.map((user: any) => {
                    const isEditing = editingUserId === user.id;

                    if (isEditing) {
                        return (
                            <tr key={user.id} style={{ borderBottom: '2px solid var(--accent-primary)', backgroundColor: 'transparent' }}>
                                <td style={{ padding: '12px 8px' }}>
                                    <input 
                                        type="text" 
                                        value={editingUserData.username} 
                                        onChange={e => setEditingUserData({...editingUserData, username: e.target.value})}
                                        style={{ width: '100%', padding: '6px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }}
                                    />
                                    {!editingUserData.isExternal && (
                                        <input 
                                            type="password"
                                            placeholder="New Password (optional)"
                                            value={editingUserData.password || ""}
                                            onChange={e => setEditingUserData({...editingUserData, password: e.target.value})}
                                            style={{ width: '100%', padding: '6px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.875rem', marginTop: '6px' }}
                                        />
                                    )}
                                </td>
                                <td style={{ padding: '12px 8px' }}>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <input 
                                            type="text" 
                                            placeholder="First" 
                                            value={editingUserData.firstName} 
                                            onChange={e => setEditingUserData({...editingUserData, firstName: e.target.value})}
                                            style={{ width: '50%', padding: '6px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }}
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Last" 
                                            value={editingUserData.lastName} 
                                            onChange={e => setEditingUserData({...editingUserData, lastName: e.target.value})}
                                            style={{ width: '50%', padding: '6px 8px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }}
                                        />
                                    </div>
                                </td>
                                <td style={{ padding: '12px 8px' }}>
                                    <select 
                                        value={editingUserData.role} 
                                        onChange={e => setEditingUserData({...editingUserData, role: e.target.value})}
                                        style={{ width: '100%', padding: '6px 8px', background: '#000', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' }}
                                    >
                                        <option value="USER">USER</option>
                                        <option value="ANALYST">ANALYST</option>
                                        <option value="NETWORK">NETWORK</option>
                                        <option value="DESKTOP">DESKTOP</option>
                                        <option value="SYSTEMS">SYSTEMS</option>
                                        <option value="ADMIN">ADMIN</option>
                                    </select>
                                </td>
                                <td colSpan={2} style={{ padding: '12px 8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={editingUserData.isExternal} 
                                                onChange={e => setEditingUserData({...editingUserData, isExternal: e.target.checked})}
                                            />
                                            Active Directory / External Auth
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={editingUserData.isRoleOverridden} 
                                                onChange={e => setEditingUserData({...editingUserData, isRoleOverridden: e.target.checked})}
                                            />
                                            Override AD Group Role
                                        </label>
                                    </div>
                                </td>
                                <td style={{ padding: '12px 8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => setEditingUserId(null)}
                                            disabled={actionLoading}
                                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={() => handleSave(user.id)}
                                            disabled={actionLoading}
                                            style={{ background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                                        >
                                            {actionLoading ? "..." : "Save"}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    }

                    return (
                        <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px 8px', fontWeight: 500 }}>{user.username}</td>
                            <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>
                                {user.firstName || user.lastName 
                                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                                    : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.875rem' }}>Not set</span>
                                }
                            </td>
                            <td style={{ padding: '12px 8px' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        background: 'transparent',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 
                                            user.role === 'ADMIN' ? 'var(--accent-primary)' : 
                                            user.role === 'SYSTEMS' ? 'rgb(45, 212, 191)' :
                                            user.role === 'ANALYST' ? 'rgb(192, 132, 252)' : 
                                            user.role === 'NETWORK' ? 'rgb(96, 165, 250)' :
                                            user.role === 'DESKTOP' ? 'rgb(251, 146, 60)' :
                                            'var(--text-secondary)'
                                    }}>
                                        {user.role}
                                    </span>
                                    {user.isExternal && (
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            background: 'transparent',
                                            color: 'rgb(74, 222, 128)',
                                            border: '1px solid rgba(34, 197, 94, 0.2)'
                                        }} title="Authenticates via Active Directory">
                                            AD / EXT
                                        </span>
                                    )}
                                    {user.isRoleOverridden && (
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            background: 'transparent',
                                            color: 'rgb(244, 63, 94)',
                                            border: '1px solid rgba(244, 63, 94, 0.2)'
                                        }} title="Local Role Override (will not sync from AD Groups)">
                                            OVERRIDE
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                            </td>
                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                                {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '12px 8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                    <button onClick={() => startEdit(user)} style={{
                                        background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px'
                                    }} className="nav-link">
                                        Edit
                                    </button>
                                    <button onClick={() => handleDelete(user.id)} style={{
                                        background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px'
                                    }} className="nav-link">
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
                {sortedUsers.length === 0 && (
                    <tr>
                        <td colSpan={6} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No accounts found. Create the first one above!
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
