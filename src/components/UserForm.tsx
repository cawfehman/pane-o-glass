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
        <form id="user-form" action={handleSubmit} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                    disabled={isPending}
                    style={{ 
                        background: 'var(--bg-dark)', 
                        border: '1px solid var(--border-color)', 
                        padding: '0.75rem 1rem', 
                        borderRadius: 'var(--radius-sm)', 
                        color: 'var(--text-primary)', 
                        outline: 'none', 
                        fontFamily: 'inherit' 
                    }}
                >
                    <option value="USER">User</option>
                    <option value="ANALYST">Analyst</option>
                    <option value="ADMIN">Admin</option>
                </select>
            </div>

            <div className="input-group">
                <label htmlFor="password">
                    Password {isExternal && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(Optional for AD)</span>}
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
                <label htmlFor="isExternal" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingBottom: '8px' }}>
                    <input 
                        type="checkbox" 
                        name="isExternal" 
                        id="isExternal" 
                        checked={isExternal}
                        onChange={(e) => setIsExternal(e.target.checked)}
                        style={{ width: '16px', height: '16px' }} 
                        disabled={isPending}
                    />
                    Use Active Directory (External)
                </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {error && <p style={{ color: '#ef4444', fontSize: '0.75rem' }}>{error}</p>}
                <button type="submit" className="btn-primary" disabled={isPending}>
                    {isPending ? "Saving..." : mode === "create" ? "Create Account" : "Update Account"}
                </button>
            </div>
        </form>
    );
}
