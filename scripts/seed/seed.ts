import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    const username = 'admin'
    const password = 'changeme123'

    // 1. Hash the password securely so the NextAuth Credentials provider can verify it
    const hashedPassword = await bcrypt.hash(password, 10)

    // 2. Insert or update the user
    const admin = await prisma.user.upsert({
        where: { username },
        update: {
            password: hashedPassword,
        },
        create: {
            username,
            password: hashedPassword,
            role: 'ADMIN',
        },
    })

    console.log('✅ Success! First user created.')
    console.log('Username:', admin.username)
    console.log('Password:', password)
    console.log('\nYou can now log in at http://localhost:3000/login and use the GUI to change this password or add more users.')
}

main()
    .catch((e) => {
        console.error('❌ Error creating user:', e.message)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
