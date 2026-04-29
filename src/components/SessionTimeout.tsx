"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

export default function SessionTimeout() {
    const { data: session } = useSession();
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Default to 10 minutes, or use user's preference (capped at 30 mins for safety)
    const timeoutMinutes = (session?.user as any)?.sessionTimeout || 10;
    const timeoutMs = Math.min(timeoutMinutes, 30) * 60 * 1000;

    const resetTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
            console.log(`[SessionTimeout] Idle for ${timeoutMinutes}m. Logging out...`);
            signOut({ callbackUrl: `${window.location.origin}/login?timeout=true` });
        }, timeoutMs);
    };

    useEffect(() => {
        const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
        
        const handler = () => resetTimer();

        events.forEach(event => {
            window.addEventListener(event, handler, { passive: true });
        });

        resetTimer(); // Start timer on mount or when timeoutMinutes changes

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                window.removeEventListener(event, handler);
            });
        };
    }, [timeoutMs]); // Re-run if the timeout preference changes

    return null;
}
