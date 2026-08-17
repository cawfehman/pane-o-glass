"use client";

import React, { useState, useMemo } from "react";
import { updateUser, deleteUser } from "@/app/actions/users";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PaginationControls } from "@/components/common/PaginationControls";
import { Search, Edit2, Trash2 } from "lucide-react";

export default function UserTableClient({ initialUsers }: { initialUsers: any[] }) {
    const [users, setUsers] = useState(initialUsers);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortField, setSortField] = useState<string>("username");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingUserData, setEditingUserData] = useState<any>({
        username: "",
        firstName: "",
        lastName: "",
        role: "USER",
        isExternal: false,
        isRoleOverridden: false,
    });
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: "danger" | "warning" | "info";
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => {},
        variant: "danger",
    });

    // Filter and Sort
    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return users;
        const q = searchQuery.toLowerCase();
        return users.filter((u: any) => {
            const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
            return (
                (u.username && u.username.toLowerCase().includes(q)) ||
                name.includes(q) ||
                (u.role && u.role.toLowerCase().includes(q))
            );
        });
    }, [users, searchQuery]);

    const sortedUsers = useMemo(() => {
        return [...filteredUsers].sort((a, b) => {
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
    }, [filteredUsers, sortField, sortDirection]);

    const paginatedUsers = useMemo(() => {
        const start = (page - 1) * limit;
        return sortedUsers.slice(start, start + limit);
    }, [sortedUsers, page, limit]);

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
            isRoleOverridden: !!user.isRoleOverridden,
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

            setUsers((prev) =>
                prev.map((u) => {
                    if (u.id === id) {
                        return {
                            ...u,
                            username: editingUserData.username,
                            firstName: editingUserData.firstName || null,
                            lastName: editingUserData.lastName || null,
                            role: editingUserData.role,
                            isExternal: editingUserData.isExternal,
                            isRoleOverridden: editingUserData.isRoleOverridden,
                        };
                    }
                    return u;
                })
            );
            setEditingUserId(null);
        } catch (err: any) {
            setConfirmModal({
                isOpen: true,
                title: "Update Error",
                message: err.message || "Failed to update user record.",
                variant: "danger",
                onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false })),
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteClick = (id: string, username: string) => {
        setConfirmModal({
            isOpen: true,
            title: `Delete Account "${username}"?`,
            message: "Are you sure you want to delete this account? This action cannot be undone.",
            variant: "danger",
            onConfirm: async () => {
                try {
                    await deleteUser(id);
                    setUsers((prev) => prev.filter((u) => u.id !== id));
                } catch (err: any) {
                    setConfirmModal({
                        isOpen: true,
                        title: "Deletion Error",
                        message: err.message || "Failed to delete user.",
                        variant: "danger",
                        onConfirm: () => setConfirmModal((prev) => ({ ...prev, isOpen: false })),
                    });
                } finally {
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                }
            },
        });
    };

    const renderIndicator = (field: string) => {
        if (sortField !== field) return <span className="opacity-30">↕</span>;
        return <span className="text-accent-primary">{sortDirection === "asc" ? "↑" : "↓"}</span>;
    };

    return (
        <div className="flex flex-col border border-border-color rounded-xl overflow-hidden bg-bg-surface shadow-sm">
            {/* Top Toolbar */}
            <div className="p-4 border-b border-border-color bg-bg-surface/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                <div className="relative w-full sm:w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search accounts or roles..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-1.5 bg-bg-dark border border-border-color rounded-lg text-text-primary text-xs outline-none focus:border-accent-primary transition-all"
                    />
                </div>

                <PaginationControls
                    totalRecords={sortedUsers.length}
                    page={page}
                    limit={limit}
                    limitOptions={[25, 50, 100]}
                    onPageChange={setPage}
                    onLimitChange={(l) => {
                        setLimit(l);
                        setPage(1);
                    }}
                    showLimitSelector={true}
                />
            </div>

            {/* Scrollable Table Content */}
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border-color bg-bg-surface text-text-secondary text-xs uppercase">
                            <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("username")}>
                                <div className="flex items-center gap-1">Username {renderIndicator("username")}</div>
                            </th>
                            <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("name")}>
                                <div className="flex items-center gap-1">Name {renderIndicator("name")}</div>
                            </th>
                            <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("role")}>
                                <div className="flex items-center gap-1">Role {renderIndicator("role")}</div>
                            </th>
                            <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("lastLogin")}>
                                <div className="flex items-center gap-1">Last Login {renderIndicator("lastLogin")}</div>
                            </th>
                            <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("createdAt")}>
                                <div className="flex items-center gap-1">Created At {renderIndicator("createdAt")}</div>
                            </th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedUsers.map((user: any) => {
                            const isEditing = editingUserId === user.id;

                            if (isEditing) {
                                return (
                                    <tr key={user.id} className="border-b-2 border-accent-primary bg-bg-surface-hover/30">
                                        <td className="py-3 px-3">
                                            <input
                                                type="text"
                                                value={editingUserData.username}
                                                onChange={(e) => setEditingUserData({ ...editingUserData, username: e.target.value })}
                                                className="w-full py-1.5 px-2.5 bg-bg-dark border border-border-color rounded-md text-text-primary text-xs outline-none focus:border-accent-primary"
                                            />
                                            {!editingUserData.isExternal && (
                                                <input
                                                    type="password"
                                                    placeholder="New Password (optional)"
                                                    value={editingUserData.password || ""}
                                                    onChange={(e) => setEditingUserData({ ...editingUserData, password: e.target.value })}
                                                    className="w-full py-1.5 px-2.5 bg-bg-dark border border-border-color rounded-md text-text-primary text-xs mt-1.5 outline-none focus:border-accent-primary"
                                                />
                                            )}
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="flex gap-1.5">
                                                <input
                                                    type="text"
                                                    placeholder="First"
                                                    value={editingUserData.firstName}
                                                    onChange={(e) => setEditingUserData({ ...editingUserData, firstName: e.target.value })}
                                                    className="w-1/2 py-1.5 px-2 bg-bg-dark border border-border-color rounded-md text-text-primary text-xs outline-none focus:border-accent-primary"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Last"
                                                    value={editingUserData.lastName}
                                                    onChange={(e) => setEditingUserData({ ...editingUserData, lastName: e.target.value })}
                                                    className="w-1/2 py-1.5 px-2 bg-bg-dark border border-border-color rounded-md text-text-primary text-xs outline-none focus:border-accent-primary"
                                                />
                                            </div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <select
                                                value={editingUserData.role}
                                                onChange={(e) => setEditingUserData({ ...editingUserData, role: e.target.value })}
                                                className="w-full py-1.5 px-2 bg-bg-dark border border-border-color rounded-md text-text-primary text-xs outline-none focus:border-accent-primary cursor-pointer"
                                            >
                                                <option value="USER">USER</option>
                                                <option value="ANALYST">ANALYST</option>
                                                <option value="NETWORK">NETWORK</option>
                                                <option value="DESKTOP">DESKTOP</option>
                                                <option value="SYSTEMS">SYSTEMS</option>
                                                <option value="ADMIN">ADMIN</option>
                                            </select>
                                        </td>
                                        <td colSpan={2} className="py-3 px-3">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingUserData.isExternal}
                                                        onChange={(e) => setEditingUserData({ ...editingUserData, isExternal: e.target.checked })}
                                                    />
                                                    Active Directory / External Auth
                                                </label>
                                                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingUserData.isRoleOverridden}
                                                        onChange={(e) => setEditingUserData({ ...editingUserData, isRoleOverridden: e.target.checked })}
                                                    />
                                                    Override AD Group Role
                                                </label>
                                            </div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="flex justify-end gap-2 items-center">
                                                <button
                                                    onClick={() => setEditingUserId(null)}
                                                    disabled={actionLoading}
                                                    className="bg-transparent border border-border-color text-text-secondary hover:text-text-primary cursor-pointer py-1 px-2.5 rounded text-xs transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleSave(user.id)}
                                                    disabled={actionLoading}
                                                    className="btn-primary py-1 px-3 rounded text-xs font-bold transition-all cursor-pointer"
                                                >
                                                    {actionLoading ? "..." : "Save"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={user.id} className="border-b border-border-color hover:bg-bg-surface-hover/30 transition-colors">
                                    <td className="p-3 font-semibold text-text-primary">{user.username}</td>
                                    <td className="p-3 text-text-secondary">
                                        {user.firstName || user.lastName ? (
                                            `${user.firstName || ""} ${user.lastName || ""}`.trim()
                                        ) : (
                                            <span className="text-text-muted italic text-xs">Not set</span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2 items-center">
                                            <span
                                                className="py-0.5 px-2 rounded-md text-xs font-bold border border-border-color bg-bg-dark"
                                                style={{
                                                    color:
                                                        user.role === "ADMIN"
                                                            ? "var(--accent-primary)"
                                                            : user.role === "SYSTEMS"
                                                            ? "rgb(45, 212, 191)"
                                                            : user.role === "ANALYST"
                                                            ? "rgb(192, 132, 252)"
                                                            : user.role === "NETWORK"
                                                            ? "rgb(96, 165, 250)"
                                                            : user.role === "DESKTOP"
                                                            ? "rgb(251, 146, 60)"
                                                            : "var(--text-secondary)",
                                                }}
                                            >
                                                {user.role}
                                            </span>
                                            {user.isExternal && (
                                                <span className="px-1.5 py-0.5 rounded text-[0.7rem] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold" title="Authenticates via Active Directory">
                                                    AD / EXT
                                                </span>
                                            )}
                                            {user.isRoleOverridden && (
                                                <span className="px-1.5 py-0.5 rounded text-[0.7rem] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold" title="Local Role Override (will not sync from AD Groups)">
                                                    OVERRIDE
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 text-text-muted text-xs">
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
                                    </td>
                                    <td className="p-3 text-text-muted text-xs">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2 items-center">
                                            <button
                                                onClick={() => startEdit(user)}
                                                className="p-1.5 rounded text-text-secondary hover:text-accent-primary hover:bg-bg-surface-hover transition-colors border-none bg-transparent cursor-pointer"
                                                title="Edit User"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(user.id, user.username)}
                                                className="p-1.5 rounded text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors border-none bg-transparent cursor-pointer"
                                                title="Delete User"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {sortedUsers.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-8 px-4 text-center text-text-muted text-xs">
                                    No matching accounts found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Bottom Pinned Pagination */}
            <div className="p-3 border-t border-border-color bg-bg-surface/80 shrink-0">
                <PaginationControls
                    totalRecords={sortedUsers.length}
                    page={page}
                    limit={limit}
                    onPageChange={setPage}
                    showLimitSelector={false}
                />
            </div>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                variant={confirmModal.variant}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
