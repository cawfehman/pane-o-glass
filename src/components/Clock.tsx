"use client";

import React, { useState, useEffect } from "react";

const Clock = React.memo(function Clock() {
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
        <div className="py-1 pb-4 flex flex-col gap-[1px] opacity-80">
            <div className="text-[0.85rem] text-text-secondary font-mono tracking-[0.5px]">
                {localTime} <span className="text-[0.7rem] text-text-muted">({tz})</span>
            </div>
            <div className="text-[0.75rem] text-text-muted font-mono tracking-[0.5px]">
                {utcTime}
            </div>
        </div>
    );
});

export default Clock;
