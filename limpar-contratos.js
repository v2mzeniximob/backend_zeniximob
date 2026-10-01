const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('⏳ Iniciando a limpeza dos dados operacionais da imobiliária...');

  try {
    // 1. Limpar históricos e movimentações dependentes (Folhas)
    console.log('1/5 - Limpando Visitas, Vistorias, Histórico de Leads e Financeiro...');
    await prisma.visit.deleteMany();
    await prisma.inspection.deleteMany();
    await prisma.leadHistory.deleteMany();
    await prisma.invoice.deleteMany(); // Financeiro e Repasses

    // 2. Limpar Contratos
    console.log('2/5 - Limpando Contratos...');
    await prisma.contract.deleteMany();

    // 3. Limpar Leads (CRM)
    console.log('3/5 - Limpando Leads (CRM)...');
    await prisma.lead.deleteMany();

    // 4. Limpar Imóveis (Precisa ser antes de apagar os donos)
    console.log('4/5 - Limpando Catálogo de Imóveis...');
    await prisma.property.deleteMany();

    // 5. Limpar Clientes (Inquilinos) e Proprietários
    console.log('5/5 - Limpando Inquilinos e Proprietários...');
    await prisma.tenant.deleteMany();
    await prisma.owner.deleteMany();

    console.log('\n🚀 SUCESSO ABSOLUTO! Os dados operacionais foram zerados.');
    console.log('A sua conta de login, corretores e imobiliária continuam intactos. Pode testar!');
  } catch (error) {
    console.error('\n❌ Erro durante a limpeza (Verifique se não ficou a faltar alguma tabela dependente):', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();