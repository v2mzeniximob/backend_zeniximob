import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs'; // ou 'bcrypt' se for o que usa no seu projeto

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando o povoamento da base de dados (Seed)...');

  // 1. Criar Utilizador Master Admin
  const masterEmail = 'master@zenix.com';
  const masterPassword = await bcrypt.hash('123456', 10);

  const master = await prisma.masterAdmin.upsert({
    where: { email: masterEmail },
    update: {},
    create: {
      name: 'Administrador Master',
      email: masterEmail,
      password: masterPassword,
      isActive: true,
    },
  });
  console.log(`✅ Master Admin criado! Login: ${master.email} | Senha: 123456`);

  // 2. Criar um Plano de Assinatura Padrão
  const plan = await prisma.plan.create({
    data: {
      name: 'Plano Zenix Pro',
      price: 199.90,
      modules: ['CRM', 'FINANCEIRO', 'CONTRATOS'],
      hasSupport: true,
      supportPrice: 50.00,
      isActive: true,
    }
  });
  console.log(`✅ Plano Padrão criado: ${plan.name}`);

  console.log('Seed concluído com sucesso! 🚀');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });