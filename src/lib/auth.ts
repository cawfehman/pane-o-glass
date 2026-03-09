import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { logAudit } from "./audit"

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials, req) {
                if (!credentials?.username || !credentials?.password) return null

                const user = await prisma.user.findUnique({
                    where: { username: credentials.username as string }
                })

                if (!user) return null

                if (user.isExternal) {
                    // TODO: Implement Active Directory / LDAP authentication
                    // For now, external accounts cannot login via Credentials provider
                    return null;
                }

                if (!user.password) return null;

                const passwordsMatch = await bcrypt.compare(
                    credentials.password as string,
                    user.password
                )

                if (passwordsMatch) {
                    // Update the last login timestamp
                    const timestamp = new Date()
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { lastLogin: timestamp }
                    })

                    // Try to extract IP from the request
                    let clientIp = 'internal';
                    try {
                        // In NextAuth v5, req contains headers and standard Request properties
                        const forwardedFor = typeof req?.headers?.get === 'function'
                            ? req.headers.get("x-forwarded-for")
                            : (req?.headers as any)?.["x-forwarded-for"];

                        if (forwardedFor) {
                            clientIp = String(forwardedFor).split(',')[0].trim();
                        }
                    } catch (e) {
                        console.error("Failed to extract IP during login", e);
                    }

                    // Log the successful login
                    await logAudit("USER_LOGIN", "Successful login", user.id, clientIp);

                    return { id: user.id, name: user.username, role: user.role }
                }

                return null
            }
        })
    ],
})

