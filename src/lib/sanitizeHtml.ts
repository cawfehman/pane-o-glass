/**
 * Lightweight, zero-dependency HTML sanitizer for template previews.
 * Runs in both browser (using native DOMParser) and SSR (using regex fallback).
 * Strips scripts, iframes, embedded objects, dangerous event handlers (onerror, onload, etc.),
 * and javascript: pseudo-protocols.
 */
export function sanitizePreviewHtml(html: string): string {
    if (!html) return "";

    // Browser environment with DOMParser available
    if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // Strip dangerous elements
            const blockedTags = ["script", "iframe", "object", "embed", "applet", "base", "link", "meta", "form"];
            blockedTags.forEach(tag => {
                const elements = doc.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });

            // Strip inline on* handlers and javascript: URIs
            const allElements = doc.querySelectorAll("*");
            allElements.forEach(el => {
                const attrNames = Array.from(el.attributes).map(a => a.name);
                attrNames.forEach(attr => {
                    if (attr.toLowerCase().startsWith("on")) {
                        el.removeAttribute(attr);
                    }
                });

                ["href", "src", "action", "data"].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && /^\s*(javascript|vbscript|data:text\/html):/i.test(val)) {
                        el.removeAttribute(attr);
                    }
                });
            });

            return doc.body.innerHTML;
        } catch {
            // Fall back to regex if DOMParser throws
        }
    }

    // SSR / Regex fallback
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
        .replace(/<embed\b[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
        .replace(/href\s*=\s*(?:['"]javascript:[^'"]*['"]|javascript:[^\s>]+)/gi, "");
}
