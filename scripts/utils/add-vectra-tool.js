const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Provisioning VECTRA Tool Permissions...');
    
    const permissions = [
        { toolId: 'vectra', role: 'ADMIN', isEnabled: true },
        { toolId: 'vectra', role: 'ANALYST', isEnabled: true },
        { toolId: 'vectra', role: 'DESKTOP', isEnabled: false },
        { toolId: 'vectra', role: 'NETWORK', isEnabled: false },
        { toolId: 'vectra', role: 'USER', isEnabled: false }
    ];

    for (const perm of permissions) {
        await prisma.toolPermission.upsert({
            where: {
                toolId_role: { toolId: perm.toolId, role: perm.role }
            },
            update: { isEnabled: perm.isEnabled },
            create: perm
        });
        console.log(`✅ ${perm.isEnabled ? 'ENABLED' : 'DISABLED'} ${perm.toolId} for ${perm.role}`);
    }

    console.log('✨ VECTRA Provisioning Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
