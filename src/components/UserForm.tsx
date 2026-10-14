"use client";

import { useState } from "react";
import { createUser, updateUser } from "@/app/actions/users";
import { useRouter } from "next/navigation";

export default function UserForm({ 
    user, 
    mode = "create" 
}: { 
    user?: any; 
    mode?: "create" | "edit" 
}) {
    const router = useRouter();
    const [isExternal, setIsExternal] = useState(user?.isExternal || false);
    const [isRoleOverridden, setIsRoleOverridden] = useState(user?.isRoleOverridden || false);
    const [error, setError] = useState("");
    const [isPending, setIsPending] = useState(false);

    async function handleSubmit(formData: FormData) {
        setIsPending(true);
        setError("");
        try {
            if (mode === "create") {
                await createUser(formData);
                // Reset form on success for create mode
                const form = document.getElementById("user-form") as HTMLFormElement;
                form?.reset();
                setIsExternal(false);
                setIsRoleOverridden(false);
            } else {
                await updateUser(user.id, formData);
                router.push("/users");
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setIsPending(false);
        }
    }

    return (
        <form id="user-form" action={handleSubmit} className="flex gap-4 items-end flex-wrap">
            <div className="input-group">
                <label htmlFor="username">Username</label>
                <input 
                    type="text" 
                    name="username" 
                    id="username" 
                    defaultValue={user?.username} 
                    required 
                    placeholder="jdoe" 
                    disabled={isPending}
                />
            </div>

            <div className="input-group">
                <label htmlFor="firstName">First Name</label>
                <input 
                    type="text" 
                    name="firstName" 
                    id="firstName" 
                    defaultValue={user?.firstName} 
                    placeholder="John" 
                    disabled={isPending}
                />
            </div>

            <div className="input-group">
                <label htmlFor="lastName">Last Name</label>
                <input 
                    type="text" 
                    name="lastName" 
                    id="lastName" 
                    defaultValue={user?.lastName} 
                    placeholder="Doe" 
                    disabled={isPending}
                />
            </div>

            <div className="input-group">
                <label htmlFor="role">Role</label>
                <select 
                    name="role" 
                    id="role" 
                    defaultValue={user?.role || "USER"}
                    onChange={(e) => {
                        if (isExternal && e.target.value !== "USER") {
                            setIsRoleOverridden(true);
                        }
                    }}
                    disabled={isPending}
                    className="bg-bg-dark border border-border-color py-3 px-4 rounded-[var(--radius-sm)] text-text-primary outline-none font-inherit"
                >
                    <option value="USER">User</option>
                    <option value="IAM">IAM</option>
                    <option value="ANALYST">Analyst</option>
                    <option value="NETWORK">Network</option>
                    <option value="DESKTOP">Desktop</option>
                    <option value="SYSTEMS">Systems</option>
                    <option value="ADMIN">Admin</option>
                </select>
            </div>

            <div className="input-group">
                <label htmlFor="password">
                    Password {isExternal && <span className="text-text-muted text-xs">(Optional for AD)</span>}
                </label>
                <input 
                    type="password" 
                    name="password" 
                    id="password" 
                    required={!isExternal && mode === "create"} 
                    placeholder={mode === "edit" ? "Leave blank to keep current" : ""}
                    disabled={isPending}
                />
            </div>

            <div className="input-group">
                <label htmlFor="isExternal" className="flex items-center gap-2 cursor-pointer pb-2">
                    <input 
                        type="checkbox" 
                        name="isExternal" 
                        id="isExternal" 
                        checked={isExternal}
                        onChange={(e) => {
                            const ext = e.target.checked;
                            setIsExternal(ext);
                            const roleSelect = document.getElementById("role") as HTMLSelectElement;
                            if (ext && roleSelect && roleSelect.value !== "USER") {
                                setIsRoleOverridden(true);
                            }
                        }}
                        className="w-4 h-4" 
                        disabled={isPending}
                    />
                    Use Active Directory (External)
                </label>
            </div>

            {isExternal && (
                <div className="input-group">
                    <label htmlFor="isRoleOverridden" className="flex items-center gap-2 cursor-pointer pb-2">
                        <input 
                            type="checkbox" 
                            name="isRoleOverridden" 
                            id="isRoleOverridden" 
                            checked={isRoleOverridden}
                            onChange={(e) => setIsRoleOverridden(e.target.checked)}
                            className="w-4 h-4" 
                            disabled={isPending}
                        />
                        <span>Override AD Group Role</span>
                        {isRoleOverridden && (
                            <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1 rounded border border-amber-500/20">
                                Locks Role
                            </span>
                        )}
                    </label>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <button type="submit" className="btn-primary" disabled={isPending}>
                    {isPending ? "Saving..." : mode === "create" ? "Create Account" : "Update Account"}
                </button>
            </div>
        </form>
    );
}
