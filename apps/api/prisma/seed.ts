/**
 * Datos de demostración.
 *
 * El seed está montado para poder comprobar a ojo las reglas del negocio:
 *   - tarifas con líneas ABIERTAS (hasta nueva tarifa) y CERRADAS (de fecha a fecha);
 *   - una tarifa nueva pendiente de activar, para ver cómo cierra sola la anterior;
 *   - comisiones generales por fábrica y overrides por producto;
 *   - un artículo que lo sirven dos fábricas a precios distintos, para que el
 *     pedido lo asigne a la más barata.
 */
import { PrismaClient } from '@prisma/client';
import '../src/env';
import { hashPassword } from '../src/lib/password';
import { activatePriceList } from '../src/modules/pricing/service';

const prisma = new PrismaClient();

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Comisión general de cada fábrica y su NIF. */
const FACTORIES = [
  {
    name: 'Industrias Metalúrgicas del Norte',
    taxId: 'B48123456',
    city: 'Valladolid',
    province: 'Valladolid',
    email: 'pedidos@imn.example',
    defaultCommissionPct: 4,
    paymentTermDays: 30,
  },
  {
    name: 'Química Aplicada Canarias',
    taxId: 'B76543210',
    city: 'Santa Cruz de Tenerife',
    province: 'Santa Cruz de Tenerife',
    email: 'comercial@quac.example',
    defaultCommissionPct: 6.5,
    paymentTermDays: 45,
  },
  {
    name: 'Envases y Embalajes Insulares',
    taxId: 'B12345678',
    city: 'Las Palmas de Gran Canaria',
    province: 'Las Palmas',
    email: 'ventas@eei.example',
    defaultCommissionPct: 3.25,
    paymentTermDays: 30,
  },
] as const;

const ARTICLES = [
  { sku: 'TORN-M8-40', name: 'Tornillo hexagonal M8x40', unit: 'ud', ean: '8412345000011' },
  { sku: 'TUER-M8', name: 'Tuerca hexagonal M8', unit: 'ud', ean: '8412345000028' },
  { sku: 'ARAN-M8', name: 'Arandela plana M8', unit: 'ud', ean: '8412345000035' },
  { sku: 'TUBO-AC-50', name: 'Tubo acero Ø50x2 mm', unit: 'm', ean: '8412345000042' },
  { sku: 'CHAPA-2', name: 'Chapa acero 2 mm', unit: 'm2', ean: '8412345000059' },
  { sku: 'BIDON-200', name: 'Bidón 200 L', unit: 'ud', ean: '8412345000066' },
  { sku: 'FILM-RET-50', name: 'Film retractil 50 cm', unit: 'rollo', ean: '8412345000073' },
  { sku: 'BOLSA-AIR', name: 'Bolsa airtight 60x80', unit: 'ud', ean: '8412345000080' },
  { sku: 'CAJA-6040', name: 'Caja cartón 60x40x30', unit: 'ud', ean: '8412345000097' },
] as const;

const CUSTOMERS = [
  {
    name: 'Construcciones Abajo S.L.',
    taxId: 'B35771838',
    city: 'Tenerife',
    province: 'Santa Cruz de Tenerife',
    email: 'compras@constrabajo.example',
  },
  {
    name: 'Distribuciones Maar S.L.',
    taxId: 'B38515240',
    city: 'Arona',
    province: 'Santa Cruz de Tenerife',
    email: 'administracion@maar.example',
  },
  {
    name: 'Suministros Industriales del Norte S.A.',
    taxId: 'A48111222',
    city: 'Palencia',
    province: 'Palencia',
    email: 'compras@sindelorte.example',
  },
] as const;

/** Comisión específica por producto, sobre factories[]. */
const COMMISSION_OVERRIDES: Record<string, Record<string, number>> = {
  'TORN-M8-40': { 'B76543210': 8 },
  'TUBO-AC-50': { 'B48123456': 5.5 },
  'FILM-RET-50': { 'B76543210': 8.5, 'B12345678': 4.75 },
};

/** Qué fábricas sirven cada artículo. */
const SUPPLIERS: Record<string, string[]> = {
  'TORN-M8-40': ['B48123456', 'B76543210'],
  'TUER-M8': ['B48123456', 'B76543210'],
  'ARAN-M8': ['B48123456'],
  'TUBO-AC-50': ['B48123456'],
  'CHAPA-2': ['B48123456'],
  'BIDON-200': ['B76543210'],
  'FILM-RET-50': ['B76543210', 'B12345678'],
  'BOLSA-AIR': ['B76543210', 'B12345678'],
  'CAJA-6040': ['B12345678'],
};

type LineSeed = {
  article: string;
  unitPrice: number;
  validFrom?: string;
  validTo?: string | null;
};

/**
 * Tarifas. Nótese el contraste deliberado:
 *  - IMN-2026-A: casi todo abierto (hasta nueva tarifa), el tornillo cerrado a fecha.
 *  - IMN-2026-B: nueva tarifa que ya sustituyó al tornillo (la A quedó cerrada).
 *  - IMN-2026-C: borrador pendiente, para activar desde la interfaz.
 *  - QAC-2026-A / B: corte limpio de calendario, de fecha a fecha.
 *
 * `validTo` es EXCLUSIVO (intervalo [desde, hasta)): la tarifa A termina el día
 * antes de que empiece la B. Por eso A corta el 01-07 y B empieza el 01-07, y
 * no "A hasta 30-06 / B desde 01-07", que dejaría el 30-06 sin ningún precio.
 */
const PRICE_LISTS: Array<{
  factoryTaxId: string;
  code: string;
  name: string;
  effectiveFrom: string;
  activate: boolean;
  notes: string;
  lines: LineSeed[];
}> = [
  {
    factoryTaxId: 'B48123456',
    code: 'IMN-2026-A',
    name: 'Tarifa general 1er semestre',
    effectiveFrom: '2026-01-01',
    activate: true,
    notes: 'Tarifa inicial. El tornillo tiene fecha de fin; el resto, hasta nueva tarifa.',
    lines: [
      { article: 'TORN-M8-40', unitPrice: 0.12, validFrom: '2026-01-01', validTo: '2026-07-01' },
      { article: 'TUER-M8', unitPrice: 0.04 },
      { article: 'ARAN-M8', unitPrice: 0.015 },
      { article: 'TUBO-AC-50', unitPrice: 8.9 },
      { article: 'CHAPA-2', unitPrice: 24.5 },
    ],
  },
  {
    factoryTaxId: 'B48123456',
    code: 'IMN-2026-B',
    name: 'Revisión de precios 2º semestre',
    effectiveFrom: '2026-07-01',
    activate: true,
    notes: 'Al activarse, cerró sola la línea del tornillo de IMN-2026-A.',
    lines: [
      { article: 'TORN-M8-40', unitPrice: 0.135 },
      { article: 'TUER-M8', unitPrice: 0.045 },
      { article: 'ARAN-M8', unitPrice: 0.016 },
      { article: 'TUBO-AC-50', unitPrice: 9.75 },
      { article: 'CHAPA-2', unitPrice: 26.9 },
    ],
  },
  {
    factoryTaxId: 'B48123456',
    code: 'IMN-2026-C',
    name: 'Actualización de octubre (PENDIENTE)',
    effectiveFrom: '2026-10-01',
    activate: false,
    notes: 'Borrador. Al activarlo verás cómo las líneas abiertas vigentes se cierran.',
    lines: [
      { article: 'TORN-M8-40', unitPrice: 0.14 },
      { article: 'TUER-M8', unitPrice: 0.046 },
      { article: 'ARAN-M8', unitPrice: 0.017 },
      { article: 'TUBO-AC-50', unitPrice: 10.1 },
      { article: 'CHAPA-2', unitPrice: 27.4 },
    ],
  },
  {
    factoryTaxId: 'B76543210',
    code: 'QAC-2026-A',
    name: 'Tarifa enero-mayo',
    effectiveFrom: '2026-01-01',
    activate: true,
    notes: 'Corte de calendario: todas las líneas terminan el 31 de mayo.',
    lines: [
      { article: 'TORN-M8-40', unitPrice: 0.1, validTo: '2026-06-01' },
      { article: 'TUER-M8', unitPrice: 0.035, validTo: '2026-06-01' },
      { article: 'BIDON-200', unitPrice: 42.0, validTo: '2026-06-01' },
      { article: 'FILM-RET-50', unitPrice: 18.4, validTo: '2026-06-01' },
      { article: 'BOLSA-AIR', unitPrice: 0.28, validTo: '2026-06-01' },
    ],
  },
  {
    factoryTaxId: 'B76543210',
    code: 'QAC-2026-B',
    name: 'Tarifa junio en adelante',
    effectiveFrom: '2026-06-01',
    activate: true,
    notes: 'A partir de aquí, precios abiertos.',
    lines: [
      { article: 'TORN-M8-40', unitPrice: 0.11 },
      { article: 'TUER-M8', unitPrice: 0.038 },
      { article: 'BIDON-200', unitPrice: 45.5 },
      { article: 'FILM-RET-50', unitPrice: 19.9 },
      { article: 'BOLSA-AIR', unitPrice: 0.3 },
    ],
  },
  {
    factoryTaxId: 'B12345678',
    code: 'EEI-2026-A',
    name: 'Tarifa general',
    effectiveFrom: '2026-01-01',
    activate: true,
    notes: 'Envases: todo abierto, sin fecha de fin prevista.',
    lines: [
      { article: 'FILM-RET-50', unitPrice: 17.95 },
      { article: 'BOLSA-AIR', unitPrice: 0.26 },
      { article: 'CAJA-6040', unitPrice: 1.35 },
    ],
  },
];

async function reset() {
  // El orden respeta las dependencias de claves foráneas.
  await prisma.commissionInvoiceServiceOrder.deleteMany();
  await prisma.commissionInvoiceLine.deleteMany();
  await prisma.commissionInvoice.deleteMany();
  await prisma.receiptVerification.deleteMany();
  await prisma.verificationBatch.deleteMany();
  await prisma.serviceOrderLine.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.salesOrderLine.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.priceListLine.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.factoryArticle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.article.deleteMany();
  await prisma.factory.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  const existing = await prisma.factory.count();
  if (existing > 0 && process.env.RESET_SEED !== '1') {
    console.log(
      `Ya hay ${existing} fábricas en la base. No se toca nada.\n` +
        'Para regenerar los datos de demostración:  RESET_SEED=1 npm run seed',
    );
    return;
  }
  await reset();
  console.log('Base vaciada.');

  /* --------------------------------- Usuarios -------------------------------- */

  await prisma.user.create({
    data: {
      email: 'admin@intermediacion.local',
      name: 'Administración',
      role: 'admin',
      passwordHash: await hashPassword('admin1234'),
    },
  });
  await prisma.user.create({
    data: {
      email: 'operaciones@intermediacion.local',
      name: 'Operaciones',
      role: 'user',
      passwordHash: await hashPassword('operaciones1234'),
    },
  });
  console.log('Usuarios: admin@intermediacion.local / admin1234');

  /* -------------------------------- Fábricas -------------------------------- */

  const factoryByTaxId = new Map<string, string>();
  for (const f of FACTORIES) {
    const row = await prisma.factory.create({
      data: {
        name: f.name,
        taxId: f.taxId,
        email: f.email,
        city: f.city,
        province: f.province,
        defaultCommissionPct: f.defaultCommissionPct,
        paymentTermDays: f.paymentTermDays,
      },
    });
    factoryByTaxId.set(f.taxId, row.id);
  }
  console.log(`${FACTORIES.length} fábricas.`);

  /* -------------------------------- Artículos -------------------------------- */

  const articleBySku = new Map<string, string>();
  for (const a of ARTICLES) {
    const row = await prisma.article.create({
      data: { sku: a.sku, name: a.name, unit: a.unit, ean: a.ean },
    });
    articleBySku.set(a.sku, row.id);
  }
  console.log(`${ARTICLES.length} artículos.`);

  /* --------------------------- Vínculos fábrica-artículo --------------------------- */

  let links = 0;
  for (const [sku, taxIds] of Object.entries(SUPPLIERS)) {
    for (const taxId of taxIds) {
      const factoryId = factoryByTaxId.get(taxId)!;
      const articleId = articleBySku.get(sku)!;
      await prisma.factoryArticle.create({
        data: {
          factoryId,
          articleId,
          factorySku: `${sku}-${taxId.slice(1, 4)}`,
          commissionPctOverride: COMMISSION_OVERRIDES[sku]?.[taxId] ?? null,
        },
      });
      links += 1;
    }
  }
  console.log(`${links} vínculos fábrica-artículo (con overrides de comisión).`);

  /* --------------------------------- Clientes --------------------------------- */

  for (const c of CUSTOMERS) {
    await prisma.customer.create({ data: c });
  }
  console.log(`${CUSTOMERS.length} clientes.`);

  /* ---------------------------------- Tarifas ---------------------------------- */

  for (const pl of PRICE_LISTS) {
    const factoryId = factoryByTaxId.get(pl.factoryTaxId)!;
    const lines: Array<{
      factoryArticleId: string;
      unitPrice: number;
      validFrom: Date;
      validTo: Date | null;
    }> = [];

    for (const l of pl.lines) {
      const articleId = articleBySku.get(l.article)!;
      const link = await prisma.factoryArticle.findUnique({
        where: { factoryId_articleId: { factoryId, articleId } },
      });
      if (!link) throw new Error(`Sin vínculo para ${l.article} en ${pl.code}`);
      lines.push({
        factoryArticleId: link.id,
        unitPrice: l.unitPrice,
        validFrom: d(l.validFrom ?? pl.effectiveFrom),
        validTo: l.validTo === undefined || l.validTo === null ? null : d(l.validTo),
      });
    }

    const created = await prisma.priceList.create({
      data: {
        factoryId,
        code: pl.code,
        name: pl.name,
        status: 'draft',
        effectiveFrom: d(pl.effectiveFrom),
        notes: pl.notes,
        lines: { create: lines },
      },
    });

    // Usamos el MISMO servicio que la API: el cierre de líneas abiertas al
    // activar queda probado por el seed, no por una lógica paralela.
    if (pl.activate) await activatePriceList(prisma, created.id);
    console.log(`  ${pl.code} ${pl.activate ? '(activada)' : '(borrador)'}`);
  }

  console.log(`\n${PRICE_LISTS.length} tarifas creadas.`);
  console.log('\nEntra con:  admin@intermediacion.local / admin1234');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
