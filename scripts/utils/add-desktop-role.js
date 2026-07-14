const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Provisioning DESKTOP Role Permissions...');
    
    const permissions = [
        { toolId: 'firewall', role: 'DESKTOP', isEnabled: true },
        { toolId: 'ise', role: 'DESKTOP', isEnabled: false },
        { toolId: 'ise-tacacs', role: 'DESKTOP', isEnabled: false },
        { toolId: 'hibp-account', role: 'DESKTOP', isEnabled: true },
        { toolId: 'hibp-domain', role: 'DESKTOP', isEnabled: false }
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

    console.log('✨ DESKTOP Role Provisioning Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
