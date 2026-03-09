const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testWrite() {
    console.log('Testing direct write to toolPermission...');
    try {
        const testRole = 'DIAGNOSTIC_' + Date.now();
        const result = await prisma.toolPermission.create({
            data: { toolId: 'test', role: testRole, isEnabled: false }
        });
        console.log('WRITE SUCCESS:', result);
        
        await prisma.toolPermission.delete({ where: { id: result.id } });
        console.log('DELETE SUCCESS');
    } catch (e) {
        console.error('WRITE FAILED:', e);
    }
}

testWrite().finally(() => prisma.$disconnect());
