"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export default function FeedbackModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const pathname = usePathname();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage(null);

        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tool: pathname,
                    subject,
                    body
                })
            });

            if (res.ok) {
                setMessage({ type: 'success', text: "Feedback submitted successfully! Thank you." });
                setSubject("");
                setBody("");
                setTimeout(() => setIsOpen(false), 2000);
            } else {
                const err = await res.text();
                setMessage({ type: 'error', text: err || "Failed to submit feedback." });
            }
        } catch (error) {
            setMessage({ type: 'error', text: "An error occurred. Please try again." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <button 
                onClick={() => setIsOpen(true)}
                className="nav-link"
                style={{ 
                    cursor: 'pointer', 
                    width: '100%', 
                    border: 'none', 
                    background: 'none', 
                    textAlign: 'left',
                    color: 'var(--text-secondary)',
                    marginTop: '1rem'
                }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Send Feedback
            </button>

            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="glass-card" style={{ width: '450px', maxWidth: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0 }}>Provide Feedback</h3>
                            <button 
                                onClick={() => setIsOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}
                            >
                                &times;
                            </button>
                        </div>

                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Your feedback helps us improve. This will be linked to your account and the current tool (**{pathname}**).
                        </p>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                                <label>Subject</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Brief summary"
                                />
                            </div>
                            <div className="input-group">
                                <label>Feedback Details</label>
                                <textarea 
                                    required 
                                    rows={4}
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="What's on your mind?"
                                    style={{
                                        width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', resize: 'vertical'
                                    }}
                                />
                            </div>

                            {message && (
                                <div style={{ 
                                    padding: '10px', 
                                    borderRadius: 'var(--radius-sm)', 
                                    backgroundColor: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                    color: message.type === 'success' ? '#22c55e' : '#ef4444',
                                    border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
                                    fontSize: '0.875rem'
                                }}>
                                    {message.text}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setIsOpen(false)}
                                    className="btn-primary"
                                    style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="btn-primary"
                                    style={{ flex: 2 }}
                                >
                                    {isSubmitting ? "Sending..." : "Submit Feedback"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
