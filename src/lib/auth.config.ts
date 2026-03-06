import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    session: { strategy: "jwt" },
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.role = (user as any).role
            }
            return token
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string
                    ; (session.user as any).role = token.role
            }
            return session
        }
    },
    providers: [], // Add providers with Edge compatibility or leaving empty here
} satisfies NextAuthConfig
