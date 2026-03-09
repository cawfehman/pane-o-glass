const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const perms = await prisma.toolPermission.findMany();
    console.log(JSON.stringify(perms, null, 2));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
