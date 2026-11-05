"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";

export default function SessionTimeout() {
    const sessionContext = useSession();
    const session = sessionContext?.data;
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
            const currentPath = `${window.location.pathname}${window.location.search}`;
            const isLoginPage = window.location.pathname.startsWith("/login");
            if (!isLoginPage && currentPath && currentPath !== "/") {
                try {
                    sessionStorage.setItem("pane_post_login_return_to", currentPath);
                } catch {}
            }
            const returnParam = !isLoginPage && currentPath && currentPath !== "/"
                ? `&returnTo=${encodeURIComponent(currentPath)}`
                : "";
            signOut({ callbackUrl: `${window.location.origin}/login?timeout=true${returnParam}` });
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
