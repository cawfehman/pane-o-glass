"use client";

import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

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
            </div>
        </div>
    )
}
