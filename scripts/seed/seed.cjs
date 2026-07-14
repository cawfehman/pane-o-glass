const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = bcrypt.hashSync('admin123', 10)

    const accounts = [
        { username: 'admin', role: 'ADMIN' },
        { username: 'test-user', role: 'USER' },
        { username: 'test-analyst', role: 'ANALYST' },
        { username: 'test-network', role: 'NETWORK' },
    ];

    for (const acc of accounts) {
        const user = await prisma.user.upsert({
            where: { username: acc.username },
            update: { 
                password: hashedPassword,
                role: acc.role
            },
            create: {
                username: acc.username,
                password: hashedPassword,
                role: acc.role,
            },
        });
        console.log(`Seeded user: ${user.username} (${user.role}) - Password: admin123`);
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
