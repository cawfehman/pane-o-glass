const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { username: true, role: true }
    });
    console.log('Users and Roles:');
    console.log(JSON.stringify(users, null, 2));

    const perms = await prisma.toolPermission.findMany();
    console.log('\nPermissions in DB:');
    console.log(JSON.stringify(perms, null, 2));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
