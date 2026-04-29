"use client";

import { useState } from "react";
import { updateSessionTimeout } from "@/app/actions/users";
import { useRouter } from "next/navigation";

interface SessionTimeoutSettingsProps {
    currentTimeout: number;
}

export default function SessionTimeoutSettings({ currentTimeout }: SessionTimeoutSettingsProps) {
    const [timeout, setTimeoutVal] = useState(currentTimeout);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const router = useRouter();

    const handleSave = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const result = await updateSessionTimeout(timeout);
            if (result.success) {
                setMessage({ type: 'success', text: `Session timeout updated to ${result.timeout} minutes.` });
                router.refresh();
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || "Failed to update timeout." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card" style={{ padding: '1.5rem', background: 'var(--bg-surface)' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Dashboard Settings</h3>
            <div style={{ maxWidth: '400px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>
                    Idle Session Timeout (Minutes)
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input 
                        type="range" 
                        min="1" 
                        max="30" 
                        value={timeout} 
                        onChange={(e) => setTimeoutVal(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
                    />
                    <span style={{ fontSize: '1.1rem', fontWeight: 600, minWidth: '3rem', textAlign: 'right' }}>
                        {timeout}m
                    </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                    * Automatically log out after {timeout} minutes of inactivity. Max 30 minutes.
                </p>

                <button 
                    onClick={handleSave}
                    disabled={loading || timeout === currentTimeout}
                    className="btn-primary"
                    style={{ marginTop: '20px', padding: '8px 24px', borderRadius: '8px' }}
                >
                    {loading ? "Saving..." : "Save Preferences"}
                </button>

                {message && (
                    <div style={{ 
                        marginTop: '16px', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        fontSize: '0.85rem',
                        backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: message.type === 'success' ? '#10b981' : '#ef4444',
                        border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`
                    }}>
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    );
}
