import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class XmlController {
  
  async generateFeed(req: Request, res: Response) {
    try {
      // 1. Pega o slug da URL (ex: "vivian")
      const { slug } = req.params; 

      // 2. Busca a imobiliária dona desse slug
      const realEstate = await prisma.realEstate.findFirst({
        where: { slug: slug }
      });

      if (!realEstate) {
        return res.status(404).json({ error: 'Imobiliária não encontrada para este link.' });
      }

      // 3. Busca apenas imóveis ATIVOS e MARCADOS para exportação
      const properties = await prisma.property.findMany({
        where: {
          realEstateId: realEstate.id,
          exportToPortals: true
        }
      });

      // 4. Inicia a construção segura do XML (Padrão VRSync - VivaReal/Zap)
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync  http://xml.vivareal.com/vrsync.xsd">\n`;
      xml += `  <Header>\n`;
      xml += `    <Provider><![CDATA[${realEstate.tradeName || realEstate.name || 'ZenixImob'}]]></Provider>\n`;
      xml += `    <Email>${realEstate.email || 'contato@suaimobiliaria.com.br'}</Email>\n`;
      xml += `  </Header>\n`;
      xml += `  <Listings>\n`;

      // 5. Loop blindado contra erros (se faltar algum dado, ele contorna)
      properties.forEach((prop: any) => {
        const transactionType = prop.transaction === 'Venda' ? 'For Sale' : 'For Rent';
        const propertyType = getVivaRealType(prop.type); 

        xml += `    <Listing>\n`;
        xml += `      <ListingID>${prop.id}</ListingID>\n`;
        xml += `      <Title><![CDATA[${prop.title || 'Imóvel'}]]></Title>\n`;
        xml += `      <TransactionType>${transactionType}</TransactionType>\n`;
        
        // Mídias (Fotos) - Protegido contra "null" ou "undefined"
        xml += `      <Media>\n`;
        if (prop.imageUrls && Array.isArray(prop.imageUrls)) {
          prop.imageUrls.forEach((img: string) => {
             if(img) {
               xml += `        <Item medium="image">\n`;
               xml += `          <Url><![CDATA[${img}]]></Url>\n`;
               xml += `        </Item>\n`;
             }
          });
        }
        xml += `      </Media>\n`;

        // Detalhes Financeiros e Estruturais (Forçando Number para evitar crash)
        xml += `      <Details>\n`;
        xml += `        <UsageType>${prop.category === 'Comercial' ? 'Commercial' : 'Residential'}</UsageType>\n`;
        xml += `        <PropertyType>${propertyType}</PropertyType>\n`;
        xml += `        <Description><![CDATA[${prop.description || prop.title || ''}]]></Description>\n`;
        xml += `        <ListPrice>${Number(prop.price || 0)}</ListPrice>\n`;
        
        if (prop.condoFee) xml += `        <PropertyAdministrationFee>${Number(prop.condoFee)}</PropertyAdministrationFee>\n`;
        if (prop.iptu) xml += `        <YearlyTax>${Number(prop.iptu)}</YearlyTax>\n`;
        
        xml += `        <LivingArea>${Number(prop.area || 0)}</LivingArea>\n`;
        xml += `        <Bedrooms>${Number(prop.bedrooms || 0)}</Bedrooms>\n`;
        xml += `        <Bathrooms>${Number(prop.bathrooms || 0)}</Bathrooms>\n`;
        xml += `        <Garage>${Number(prop.garage || 0)}</Garage>\n`;
        xml += `      </Details>\n`;

        // Localização
        xml += `      <Location>\n`;
        xml += `        <Country abbreviation="BR">Brasil</Country>\n`;
        xml += `        <State abbreviation="${prop.state || 'SP'}"><![CDATA[${prop.state || 'SP'}]]></State>\n`;
        xml += `        <City><![CDATA[${prop.city || ''}]]></City>\n`;
        xml += `        <Neighborhood><![CDATA[${prop.neighborhood || ''}]]></Neighborhood>\n`;
        xml += `        <Address><![CDATA[${prop.address || ''}]]></Address>\n`;
        
        const rawCep = prop.cep ? prop.cep.replace(/\D/g, '') : '';
        if(rawCep) {
          xml += `        <PostalCode>${rawCep}</PostalCode>\n`;
        }
        
        xml += `      </Location>\n`;
        xml += `    </Listing>\n`;
      });

      xml += `  </Listings>\n`;
      xml += `</ListingDataFeed>`;

      // 6. Define que o retorno é um ficheiro XML e envia
      res.header('Content-Type', 'application/xml');
      return res.send(xml);

    } catch (error) {
      // LOG super detalhado no Render caso algo fuja ao controle
      console.error("=========================================");
      console.error("❌ ERRO CRÍTICO AO GERAR O XML DA IMOBILIÁRIA");
      console.error(error);
      console.error("=========================================");
      return res.status(500).json({ error: 'Erro interno ao gerar feed XML.' });
    }
  }

  // Ativar/Desativar exportação de 1 imóvel
  async toggleExport(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { exportToPortals } = req.body;
      const property = await prisma.property.update({
        where: { id },
        data: { exportToPortals }
      });
      return res.json(property);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar exportação.' });
    }
  }
}

// Conversor de tipos da imobiliária para o padrão Inglês exigido pelos portais
function getVivaRealType(type: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('apartamento')) return 'Apartment';
  if (t.includes('casa')) return 'Home';
  if (t.includes('terreno') || t.includes('lote')) return 'Land Lot';
  if (t.includes('comercial') || t.includes('loja')) return 'Commercial/Industrial';
  if (t.includes('fazenda') || t.includes('sítio') || t.includes('chácara')) return 'Farm/Agriculture';
  return 'Residential / Commercial';
}