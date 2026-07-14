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
        <div className="glass-card p-6 bg-bg-surface">
            <h3 className="mb-4 text-text-primary">Dashboard Settings</h3>
            <div className="max-w-[400px]">
                <label className="block text-text-secondary text-[0.85rem] mb-2">
                    Idle Session Timeout (Minutes)
                </label>
                <div className="flex gap-3 items-center">
                    <input 
                        type="range" 
                        min="1" 
                        max="30" 
                        value={timeout} 
                        onChange={(e) => setTimeoutVal(parseInt(e.target.value))}
                        className="flex-1 accent-accent-primary"
                    />
                    <span className="text-[1.1rem] font-semibold min-w-[3rem] text-right">
                        {timeout}m
                    </span>
                </div>
                <p className="text-[0.75rem] text-text-muted mt-2 italic">
                    * Automatically log out after {timeout} minutes of inactivity. Max 30 minutes.
                </p>

                <button 
                    onClick={handleSave}
                    disabled={loading || timeout === currentTimeout}
                    className="btn-primary mt-5 px-6 py-2 rounded-lg"
                >
                    {loading ? "Saving..." : "Save Preferences"}
                </button>

                {message && (
                    <div className={`mt-4 p-3 rounded-md text-[0.85rem] border ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500' : 'bg-red-500/10 text-red-500 border-red-500'}`}>
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    );
}
