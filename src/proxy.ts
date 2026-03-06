import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

export default NextAuth(authConfig).auth((req) => {
    // ---------------------------------------------------------
    // Logging Visitor Connections
    // ---------------------------------------------------------
    const ip = req.headers.get('x-forwarded-for') || (req as any).ip || req.headers.get('x-real-ip') || 'Unknown IP';
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.nextUrl.pathname;

    // Extract additional context
    const userAgent = req.headers.get('user-agent') || 'Unknown Agent';
    const referer = req.headers.get('referer') || 'Direct';
    const username = req.auth?.user?.name || req.auth?.user?.email || 'Anonymous';

    console.log(`[${timestamp}] ${ip} - ${method} ${path} | User: ${username} | Referer: ${referer} | Agent: ${userAgent}`);
    // ---------------------------------------------------------

    const isLoggedIn = !!req.auth?.user;
    const isOnLoginPage = req.nextUrl.pathname.startsWith('/login');
    const isHealthCheck = req.nextUrl.pathname === '/api/health';

    // Allow public access to health check
    if (isHealthCheck) return;

    if (isOnLoginPage) {
        if (isLoggedIn) {
            return Response.redirect(new URL('/', req.nextUrl));
        }
        return;
    }

    if (!isLoggedIn) {
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
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
