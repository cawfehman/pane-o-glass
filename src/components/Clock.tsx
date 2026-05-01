"use client";

import { useState, useEffect } from "react";

export default function Clock() {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Get timezone abbreviation (e.g., EST, EDT)
    const tz = time.toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ').pop();
    
    const localTime = time.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
    });
    
    const utcTime = time.toISOString().split('T')[1].split('.')[0] + " UTC";

    return (
        <div style={{ 
            padding: '4px 0 16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            opacity: 0.8
        }}>
            <div style={{ 
                fontSize: '0.85rem', 
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                letterSpacing: '0.5px'
            }}>
                {localTime} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({tz})</span>
            </div>
            <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-muted)', 
                fontFamily: 'monospace',
                letterSpacing: '0.5px'
            }}>
                {utcTime}
            </div>
        </div>
    );
}
