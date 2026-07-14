import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { rateLimit } from "@/lib/rate-limit"

export default NextAuth(authConfig).auth((req) => {
    // ---------------------------------------------------------
    // Logging Visitor Connections
    // ---------------------------------------------------------
    const xff = req.headers.get('x-forwarded-for');
    const ip = xff ? xff.split(',')[0].trim() : (req as any).ip || req.headers.get('x-real-ip') || 'Unknown IP';
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.nextUrl.pathname;

    // Extract additional context
    const userAgent = req.headers.get('user-agent') || 'Unknown Agent';
    const referer = req.headers.get('referer') || 'Direct';
    const username = req.auth?.user?.name || req.auth?.user?.email || 'Anonymous';

    const safeIp = ip === 'Unknown IP' ? ip : '[REDACTED]';
    const safeUsername = username === 'Anonymous' ? username : '[REDACTED]';
    console.log(`[${timestamp}] ${safeIp} - ${method} ${path} | User: ${safeUsername} | Referer: ${referer} | Agent: ${userAgent}`);
    // ---------------------------------------------------------

    // Apply strict rate limiting for login attempts
    if (req.method === 'POST' && (req.nextUrl.pathname.includes('login') || req.nextUrl.pathname.startsWith('/api/auth'))) {
        if (!rateLimit(`${ip}-auth`, 50, 60000)) { // 50 requests per minute to prevent NAT/Proxy lockouts
            return new Response("Too Many Requests", { status: 429 });
        }
    } else if (req.nextUrl.pathname.startsWith('/api/')) {
        // Apply general API rate limiting (e.g., 200 requests per minute)
        if (!rateLimit(`${ip}-api`, 200, 60000)) {
            return new Response("Too Many Requests", { status: 429 });
        }
    }

    const isLoggedIn = !!req.auth?.user;
    const isOnLoginPage = req.nextUrl.pathname.startsWith('/login');
    const isHealthCheck = req.nextUrl.pathname === '/api/health';
    const isPublicRoute = req.nextUrl.pathname.startsWith('/public/');
    const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth');

    // Allow public access to health check, auth callbacks, and public routes
    if (isHealthCheck || isPublicRoute || isAuthRoute) return;

    if (isOnLoginPage) {
        if (isLoggedIn) {
            return Response.redirect(new URL('/', req.nextUrl));
        }
        return;
    }

    if (!isLoggedIn) {
        // If visiting root, go to public password check
        if (req.nextUrl.pathname === '/') {
            return Response.redirect(new URL('/public/password-check', req.nextUrl));
        }

        let from = req.nextUrl.pathname;
        if (req.nextUrl.search) {
            from += req.nextUrl.search;
        }
        return Response.redirect(
            new URL(`/login?from=${encodeURIComponent(from)}`, req.nextUrl)
        );
    }
})

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
