import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test users...');
  const passwordHash = await bcrypt.hash('testpassword123', 10);

  const users = [
    { username: 'test_admin', role: 'ADMIN' },
    { username: 'test_engineer', role: 'ENGINEER' },
    { username: 'test_tier2', role: 'TIER2' },
    { username: 'test_user', role: 'USER' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        password: passwordHash,
        role: u.role,
      },
      create: {
        username: u.username,
        password: passwordHash,
        role: u.role,
      },
    });
  }
  
  console.log('Test users seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
