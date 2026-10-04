// Caminho: src/controllers/XmlController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class XmlController {
  async generateFeed(req: Request, res: Response) {
    try {
      const { slug } = req.params; // Pega o slug da imobiliária na URL

      // Encontra a imobiliária e os imóveis marcados para exportação
      const store = await prisma.realEstate.findUnique({
        where: { slug },
        include: {
          properties: {
            where: { exportToPortals: true, isActive: true },
            include: { images: true }
          }
        }
      });

      if (!store) return res.status(404).send('Imobiliária não encontrada');

      // Monta o XML no padrão de mercado (Zap/VivaReal)
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<Carga xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n`;
      xml += `  <Imoveis>\n`;

      store.properties.forEach((prop: any) => {
        const isRent = prop.transaction.includes('Aluguel') || prop.transaction.includes('Locação');
        const isSale = prop.transaction.includes('Venda');

        xml += `    <Imovel>\n`;
        xml += `      <CodigoImovel>${prop.id}</CodigoImovel>\n`;
        xml += `      <TipoImovel>${prop.type}</TipoImovel>\n`;
        xml += `      <TituloImovel><![CDATA[${prop.title}]]></TituloImovel>\n`;
        xml += `      <Observacao><![CDATA[${prop.description}]]></Observacao>\n`;
        xml += `      <QtdDormitorios>${prop.bedrooms}</QtdDormitorios>\n`;
        xml += `      <QtdSuites>${prop.suites || 0}</QtdSuites>\n`;
        xml += `      <QtdBanheiros>${prop.bathrooms}</QtdBanheiros>\n`;
        xml += `      <QtdVagas>${prop.garage}</QtdVagas>\n`;
        xml += `      <AreaTotal>${prop.totalArea || prop.usefulArea}</AreaTotal>\n`;
        xml += `      <AreaUtil>${prop.usefulArea}</AreaUtil>\n`;
        
        xml += `      <PrecoVenda>${isSale ? prop.price : 0}</PrecoVenda>\n`;
        xml += `      <PrecoLocacao>${isRent ? prop.price : 0}</PrecoLocacao>\n`;
        xml += `      <ValorCondominio>${prop.condoFee || 0}</ValorCondominio>\n`;
        xml += `      <ValorIPTU>${prop.iptu || 0}</ValorIPTU>\n`;

        xml += `      <Bairro><![CDATA[${prop.neighborhood}]]></Bairro>\n`;
        xml += `      <Cidade><![CDATA[${prop.city}]]></Cidade>\n`;
        xml += `      <UF>${prop.state}</UF>\n`;
        xml += `      <CEP>${prop.cep}</CEP>\n`;

        // Imagens
        if (prop.images && prop.images.length > 0) {
          xml += `      <Fotos>\n`;
          prop.images.forEach((img: any, index: number) => {
            xml += `        <Foto>\n`;
            xml += `          <NomeArquivo><![CDATA[Foto ${index + 1}]]></NomeArquivo>\n`;
            xml += `          <URLArquivo><![CDATA[${img.url}]]></URLArquivo>\n`;
            xml += `          <Principal>${index === 0 ? 1 : 0}</Principal>\n`;
            xml += `        </Foto>\n`;
          });
          xml += `      </Fotos>\n`;
        }

        xml += `    </Imovel>\n`;
      });

      xml += `  </Imoveis>\n`;
      xml += `</Carga>`;

      // Retorna com o header de XML
      res.set('Content-Type', 'text/xml');
      return res.send(xml);

    } catch (error) {
      console.error('Erro ao gerar XML:', error);
      return res.status(500).json({ error: 'Erro interno ao gerar feed XML.' });
    }
  }
}