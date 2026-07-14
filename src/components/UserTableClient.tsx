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
    const [dialog, setDialog] = useState<{ isOpen: boolean, type: 'alert' | 'confirm', message: string, onConfirm?: () => void } | null>(null);

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
            setDialog({ isOpen: true, type: 'alert', message: "Failed to update user record." });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteClick = (id: string) => {
        setDialog({ 
            isOpen: true, 
            type: 'confirm', 
            message: "Are you sure you want to delete this account?",
            onConfirm: async () => {
                try {
                    await deleteUser(id);
                    setUsers(prev => prev.filter(u => u.id !== id));
                } catch (err: any) {
                    setDialog({ isOpen: true, type: 'alert', message: err.message || "Failed to delete user." });
                }
            }
        });
    };

    const renderIndicator = (field: string) => {
        if (sortField !== field) return <span className="opacity-30">↕</span>;
        return <span className="text-accent-primary">{sortDirection === "asc" ? "↑" : "↓"}</span>;
    };

    return (
        <>
        <table className="w-full border-collapse text-left">
            <thead className="sticky-header">
                <tr className="border-b border-border-color text-text-secondary">
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('username')}>
                        <div className="flex items-center gap-1">Username {renderIndicator('username')}</div>
                    </th>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">Name {renderIndicator('name')}</div>
                    </th>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('role')}>
                        <div className="flex items-center gap-1">Role {renderIndicator('role')}</div>
                    </th>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('lastLogin')}>
                        <div className="flex items-center gap-1">Last Login {renderIndicator('lastLogin')}</div>
                    </th>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('createdAt')}>
                        <div className="flex items-center gap-1">Created At {renderIndicator('createdAt')}</div>
                    </th>
                    <th className="p-3 text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {sortedUsers.map((user: any) => {
                    const isEditing = editingUserId === user.id;

                    if (isEditing) {
                        return (
                            <tr key={user.id} className="border-b-2 border-accent-primary bg-transparent">
                                <td className="py-3 px-2">
                                    <input 
                                        type="text" 
                                        value={editingUserData.username} 
                                        onChange={e => setEditingUserData({...editingUserData, username: e.target.value})}
                                        className="w-full py-1.5 px-2 bg-transparent border border-border-color rounded-md text-white text-sm"
                                    />
                                    {!editingUserData.isExternal && (
                                        <input 
                                            type="password"
                                            placeholder="New Password (optional)"
                                            value={editingUserData.password || ""}
                                            onChange={e => setEditingUserData({...editingUserData, password: e.target.value})}
                                            className="w-full py-1.5 px-2 bg-transparent border border-border-color rounded-md text-white text-sm mt-1.5"
                                        />
                                    )}
                                </td>
                                <td className="py-3 px-2">
                                    <div className="flex gap-1">
                                        <input 
                                            type="text" 
                                            placeholder="First" 
                                            value={editingUserData.firstName} 
                                            onChange={e => setEditingUserData({...editingUserData, firstName: e.target.value})}
                                            className="w-1/2 py-1.5 px-2 bg-transparent border border-border-color rounded-md text-white text-sm"
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Last" 
                                            value={editingUserData.lastName} 
                                            onChange={e => setEditingUserData({...editingUserData, lastName: e.target.value})}
                                            className="w-1/2 py-1.5 px-2 bg-transparent border border-border-color rounded-md text-white text-sm"
                                        />
                                    </div>
                                </td>
                                <td className="py-3 px-2">
                                    <select 
                                        value={editingUserData.role} 
                                        onChange={e => setEditingUserData({...editingUserData, role: e.target.value})}
                                        className="w-full py-1.5 px-2 bg-black border border-border-color rounded-md text-white text-sm"
                                    >
                                        <option value="USER">USER</option>
                                        <option value="ANALYST">ANALYST</option>
                                        <option value="NETWORK">NETWORK</option>
                                        <option value="DESKTOP">DESKTOP</option>
                                        <option value="SYSTEMS">SYSTEMS</option>
                                        <option value="ADMIN">ADMIN</option>
                                    </select>
                                </td>
                                <td colSpan={2} className="py-3 px-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="flex items-center gap-1.5 text-xs text-text-muted">
                                            <input 
                                                type="checkbox" 
                                                checked={editingUserData.isExternal} 
                                                onChange={e => setEditingUserData({...editingUserData, isExternal: e.target.checked})}
                                            />
                                            Active Directory / External Auth
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-text-muted">
                                            <input 
                                                type="checkbox" 
                                                checked={editingUserData.isRoleOverridden} 
                                                onChange={e => setEditingUserData({...editingUserData, isRoleOverridden: e.target.checked})}
                                            />
                                            Override AD Group Role
                                        </label>
                                    </div>
                                </td>
                                <td className="py-3 px-2">
                                    <div className="flex justify-end gap-2 items-center">
                                        <button 
                                            onClick={() => setEditingUserId(null)}
                                            disabled={actionLoading}
                                            className="bg-transparent border border-white/20 text-text-muted cursor-pointer py-1 px-2 rounded text-xs"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={() => handleSave(user.id)}
                                            disabled={actionLoading}
                                            className="bg-transparent border border-accent-primary text-accent-primary cursor-pointer py-1 px-2 rounded text-xs font-bold"
                                        >
                                            {actionLoading ? "..." : "Save"}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    }

                    return (
                        <tr key={user.id} className="border-b border-border-color">
                            <td className="p-3 font-medium">{user.username}</td>
                            <td className="p-3 text-text-primary">
                                {user.firstName || user.lastName 
                                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                                    : <span className="text-text-muted italic text-sm">Not set</span>
                                }
                            </td>
                            <td className="p-3">
                                <div className="flex gap-2 items-center">
                                    <span className="py-1 px-2 rounded-xl text-xs bg-transparent border border-white/10" style={{
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
                                        <span className="px-2 py-1 rounded-xl text-xs bg-transparent text-green-400 border border-green-500/20" title="Authenticates via Active Directory">
                                            AD / EXT
                                        </span>
                                    )}
                                    {user.isRoleOverridden && (
                                        <span className="px-2 py-1 rounded-xl text-xs bg-transparent text-rose-500 border border-rose-500/20" title="Local Role Override (will not sync from AD Groups)">
                                            OVERRIDE
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="p-3 text-text-muted">
                                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                            </td>
                            <td className="p-3 text-text-muted">
                                {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-3">
                                <div className="flex justify-end gap-2 items-center">
                                    <button onClick={() => startEdit(user)} className="nav-link bg-transparent border-none text-accent-primary cursor-pointer px-2 py-1 rounded">
                                        Edit
                                    </button>
                                    <button onClick={() => handleDeleteClick(user.id)} className="nav-link bg-transparent border-none text-red-500 cursor-pointer px-2 py-1 rounded">
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
                {sortedUsers.length === 0 && (
                    <tr>
                        <td colSpan={6} className="py-6 px-2 text-center text-text-muted">
                            No accounts found. Create the first one above!
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
        {dialog?.isOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
                <div className="bg-bg-surface p-6 rounded-lg min-w-[300px] border border-border-color shadow-md">
                    <p className="mb-6">{dialog.message}</p>
                    <div className="flex justify-end gap-3">
                        {dialog.type === 'confirm' && (
                            <button onClick={() => setDialog(null)} className="py-2 px-4 bg-transparent border border-border-color text-text-secondary rounded cursor-pointer">Cancel</button>
                        )}
                        <button onClick={() => {
                            if(dialog.type === 'confirm' && dialog.onConfirm) {
                                dialog.onConfirm();
                            }
                            setDialog(null);
                        }} className="py-2 px-4 bg-accent-primary border-none text-white rounded cursor-pointer">
                            {dialog.type === 'confirm' ? 'Confirm' : 'OK'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
