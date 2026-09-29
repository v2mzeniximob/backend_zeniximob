import bcrypt from 'bcryptjs';
import process from 'process';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('zenix220579', 10);

  const master = await prisma.masterAdmin.upsert({
    where: { email: 'admin@zeniximob.com' },
    update: {},
    create: {
      name: 'Administrador Master',
      email: 'admin@zeniximob.com',
      password: hashedPassword,
    },
  });

  console.log('Usuário Master criado:', master.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });