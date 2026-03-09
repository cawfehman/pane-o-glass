"use client";

import { signIn } from "next-auth/react"
import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="login-container"><div className="login-card">Loading...</div></div>}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get("timeout") === "true";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(false);
        setIsLoading(true);

        try {
            const res = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (res?.error) {
                setError(true);
                setPassword("");
                setTimeout(() => setError(false), 2000);
            } else if (res?.ok) {
                router.push("/");
                router.refresh();
            }
        } catch (err) {
            setError(true);
            setPassword("");
            setTimeout(() => setError(false), 2000);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className={`login-card ${error ? 'shake-animation' : ''}`}>
                <h1 style={{ color: error ? '#ef4444' : 'inherit', transition: 'color 0.3s' }}>
                    {error ? 'Access Denied' : 'Welcome Back'}
                </h1>
                {isTimeout && (
                    <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '0.875rem' }}>
                        Your session has expired due to 10 minutes of inactivity. Please sign in again.
                    </div>
                )}
                <p>Sign in to your dashboard</p>
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            name="username"
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            name="password"
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                    </div>
                    <button type="submit" className="btn-primary" disabled={isLoading}>
                        {isLoading ? 'Authenticating...' : 'Sign In'}
                    </button>
                    {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '1rem', textAlign: 'center' }}>Invalid username or password.</p>}
                </form>

                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '12px' }}>Security Tools</p>
                    <a href="/public/password-check" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px',
                        padding: '12px',
                        background: 'rgba(234, 179, 8, 0.05)',
                        border: '1px solid rgba(234, 179, 8, 0.2)',
                        borderRadius: '8px',
                        color: '#eab308',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s'
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        Public Password Risk Check
                    </a>
                </div>
            </div>
        </div>
    )
}
