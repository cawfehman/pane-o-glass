"use client";

import { useState, useEffect } from "react";

export default function Clock() {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const localTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const utcTime = time.toISOString().split('T')[1].split('.')[0] + " UTC";

    return (
        <div style={{ 
            padding: '12px 16px', 
            marginBottom: '1rem', 
            background: 'rgba(255, 255, 255, 0.03)', 
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
        }}>
            <div style={{ 
                fontSize: '1.1rem', 
                fontWeight: 600, 
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                letterSpacing: '1px'
            }}>
                {localTime}
            </div>
            <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-muted)', 
                fontFamily: 'monospace',
                fontWeight: 500,
                letterSpacing: '0.5px'
            }}>
                {utcTime}
            </div>
        </div>
    );
}
