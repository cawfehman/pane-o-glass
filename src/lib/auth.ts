import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { logAudit } from "./audit"
import { authenticateWithAD } from "./ldap"

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

                // Try to extract IP early for audit logging
                let clientIp = 'internal';
                try {
                    const forwardedFor = typeof req?.headers?.get === 'function'
                        ? req.headers.get("x-forwarded-for")
                        : (req?.headers as any)?.["x-forwarded-for"];

                    if (forwardedFor) {
                        clientIp = String(forwardedFor).split(',')[0].trim();
                    }
                } catch (e) {
                    console.error("Failed to extract IP during login", e);
                }

                const user = await prisma.user.findUnique({
                    where: { username: credentials.username as string }
                })

                if (!user) {
                    await logAudit("LOGIN_FAILURE", `Login attempt for non-existent user: ${credentials.username}`, undefined, clientIp);
                    return null
                }

                if ((user as any).isExternal) {
                    const isValid = await authenticateWithAD(credentials.username as string, credentials.password as string);
                    if (!isValid) {
                        await logAudit("LOGIN_FAILURE", `AD authentication failed for user: ${user.username}`, user.id, clientIp);
                        return null;
                    }
                } else {
                    if (!user.password) {
                        await logAudit("LOGIN_FAILURE", `Local login attempt for user without password: ${user.username}`, user.id, clientIp);
                        return null;
                    }

                    const passwordsMatch = await bcrypt.compare(
                        credentials.password as string,
                        user.password
                    )

                    if (!passwordsMatch) {
                        await logAudit("LOGIN_FAILURE", `Incorrect local password for user: ${user.username}`, user.id, clientIp);
                        return null;
                    }
                }

                // If we reached here, authentication was successful (either AD or Local)
                const timestamp = new Date()
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLogin: timestamp }
                })

                // Log the successful login
                await logAudit("USER_LOGIN", "Successful login", user.id, clientIp);

                return { id: user.id, name: user.username, role: user.role }
            }
        })
    ],
})

