"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export default function SessionTimeout() {
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
            signOut({ callbackUrl: `${window.location.origin}/login?timeout=true` });
        }, TIMEOUT_MS);
    };

    useEffect(() => {
        const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
        
        events.forEach(event => {
            window.addEventListener(event, resetTimer, { passive: true });
        });

        resetTimer(); // Start timer on mount

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, []);

    return null;
}
