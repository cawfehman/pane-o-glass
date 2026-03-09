const { prisma } = require('../src/lib/prisma');

async function test() {
    console.log('Checking prisma.toolPermission...');
    if (prisma.toolPermission) {
        console.log('SUCCESS: prisma.toolPermission exists!');
        const count = await prisma.toolPermission.count();
        console.log('Count:', count);
    } else {
        console.log('FAILURE: prisma.toolPermission is UNDEFINED!');
        console.log('Available models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
    }
}

test().catch(console.error);
