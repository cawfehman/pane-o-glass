"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function FeedbackModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const pathname = usePathname();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        if (isOpen) document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

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
                className="nav-link w-full border-none bg-transparent text-left text-text-secondary mt-4 cursor-pointer"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Send Feedback
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm">
                    <div className="glass-card w-[450px] max-w-[90%]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="m-0">Provide Feedback</h3>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="bg-transparent border-none text-text-muted cursor-pointer text-2xl"
                            >
                                &times;
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mb-6">
                            Your feedback helps us improve. This will be linked to your account and the current tool (**{pathname}**).
                        </p>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                                    className="w-full p-3 bg-white/5 border border-border-color rounded text-text-primary text-[0.9rem] outline-none resize-y focus:border-accent-primary focus:shadow-glow transition-all"
                                />
                            </div>

                            {message && (
                                <div className={`p-[10px] rounded text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-500 border-green-500' : 'bg-red-500/10 text-red-500 border-red-500'}`}>
                                    {message.text}
                                </div>
                            )}

                            <div className="flex gap-[10px] mt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setIsOpen(false)}
                                    className="btn-primary flex-1 bg-transparent border border-border-color text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="btn-primary flex-[2]"
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
