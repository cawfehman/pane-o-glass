import { auth } from "@/lib/auth"

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const isOnLoginPage = req.nextUrl.pathname.startsWith('/login');

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
