const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_PERMISSIONS = [
    // ADMIN: All tools enabled
    { toolId: 'firewall', role: 'ADMIN', isEnabled: true },
    { toolId: 'ise', role: 'ADMIN', isEnabled: true },
    { toolId: 'ise-failures', role: 'ADMIN', isEnabled: true },
    { toolId: 'hibp-account', role: 'ADMIN', isEnabled: true },
    { toolId: 'hibp-domain', role: 'ADMIN', isEnabled: true },

    // ANALYST: Core tools enabled
    { toolId: 'firewall', role: 'ANALYST', isEnabled: true },
    { toolId: 'ise', role: 'ANALYST', isEnabled: true },
    { toolId: 'ise-failures', role: 'ANALYST', isEnabled: true },
    { toolId: 'hibp-account', role: 'ANALYST', isEnabled: true },
    { toolId: 'hibp-domain', role: 'ANALYST', isEnabled: false },

    // USER: Minimal tools enabled
    { toolId: 'firewall', role: 'USER', isEnabled: false },
    { toolId: 'ise', role: 'USER', isEnabled: false },
    { toolId: 'ise-failures', role: 'USER', isEnabled: false },
    { toolId: 'hibp-account', role: 'USER', isEnabled: true },
    { toolId: 'hibp-domain', role: 'USER', isEnabled: false },
];

async function main() {
    console.log('Seeding tool permissions...');
    for (const perm of DEFAULT_PERMISSIONS) {
        await prisma.toolPermission.upsert({
            where: {
                toolId_role: { toolId: perm.toolId, role: perm.role }
            },
            update: {},
            create: perm
        });
    }
    console.log('Seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
