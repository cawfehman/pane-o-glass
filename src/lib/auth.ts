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
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) return null

                const user = await prisma.user.findUnique({
                    where: { username: credentials.username as string }
                })

                if (!user) return null

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

                    // Log the successful login
                    await logAudit("USER_LOGIN", "Successful login", user.id);

                    return { id: user.id, name: user.username, role: user.role }
                }

                return null
            }
        })
    ],
})

