/**
 * Helper to record audit log events from client components.
 */
export async function sendClientAuditLog(action: string, details: string) {
    try {
        await fetch("/api/audit/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, details }),
        });
    } catch (e) {
        console.error("Failed to record client audit log event:", e);
    }
}
