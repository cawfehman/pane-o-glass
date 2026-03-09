"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/app/actions/users";

export default function PasswordChangeForm() {
    const [isPending, setIsPending] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    async function handleSubmit(formData: FormData) {
        setIsPending(true);
        setMessage({ type: "", text: "" });

        const newPass = formData.get("newPassword") as string;
        const confirmPass = formData.get("confirmPassword") as string;

        if (newPass !== confirmPass) {
            setMessage({ type: "error", text: "New passwords do not match." });
            setIsPending(false);
            return;
        }

        try {
            const result = await changeOwnPassword(formData);
            if (result.success) {
                setMessage({ type: "success", text: "Password changed successfully!" });
                (document.getElementById("password-form") as HTMLFormElement)?.reset();
            }
        } catch (err: any) {
            setMessage({ type: "error", text: err.message || "Failed to change password." });
        } finally {
            setIsPending(false);
        }
    }

    return (
        <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>Change Password</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
                For local accounts only. Active Directory authenticated users must change their password through corporate systems.
            </p>

            <form id="password-form" action={handleSubmit} className="login-form">
                <div className="input-group">
                    <label htmlFor="currentPassword">Current Password</label>
                    <input type="password" name="currentPassword" id="currentPassword" required disabled={isPending} />
                </div>

                <div className="input-group">
                    <label htmlFor="newPassword">New Password</label>
                    <input type="password" name="newPassword" id="newPassword" required disabled={isPending} />
                </div>

                <div className="input-group">
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <input type="password" name="confirmPassword" id="confirmPassword" required disabled={isPending} />
                </div>

                {message.text && (
                    <div style={{ 
                        padding: '12px', 
                        borderRadius: '4px', 
                        backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                        color: message.type === 'error' ? '#ef4444' : '#4ade80',
                        marginBottom: '16px',
                        fontSize: '0.875rem'
                    }}>
                        {message.text}
                    </div>
                )}

                <button type="submit" className="btn-primary" disabled={isPending}>
                    {isPending ? "Updating..." : "Change Password"}
                </button>
            </form>
        </div>
    );
}
