const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Testing upsert...');
    try {
        const result = await prisma.toolPermission.upsert({
            where: {
                toolId_role: { toolId: 'firewall', role: 'ADMIN' }
            },
            update: { isEnabled: true },
            create: { toolId: 'firewall', role: 'ADMIN', isEnabled: true }
        });
        console.log('Upsert succeeded:', result);
    } catch (e) {
        console.error('Upsert FAILED:', e);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
