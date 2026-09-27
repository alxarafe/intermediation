/**
 * Prueba de humo end-to-end contra la API en marcha.
 * Comprueba las 6 reglas de negocio del enunciado.
 *
 * NOTA: el test MUTA el estado (crea pedidos, activa una tarifa). Requiere una
 * base recién sembrada:  RESET_SEED=1 npm run seed
 */
const BASE = process.env.BASE ?? 'http://localhost:3000';
let token = '';
let pass = 0;
let fail = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `(esperado ${expected}, obtenido ${actual})`);
}

function near(name, actual, expected) {
  const a = Number(actual);
  const b = Number(expected);
  ok(name, Math.abs(a - b) < 1e-6, `(esperado ${b}, obtenido ${a})`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const section = (t) => console.log(`\n== ${t}`);

/* ------------------------------------------------------------------ Login */

section('Autenticación');
{
  const bad = await api('POST', '/api/auth/login', {
    email: 'admin@intermediacion.local',
    password: 'incorrecta',
  });
  eq('contraseña incorrecta → 401', bad.status, 401);

  const r = await api('POST', '/api/auth/login', {
    email: 'admin@intermediacion.local',
    password: 'admin1234',
  });
  eq('login correcto → 200', r.status, 200);
  ok('devuelve token', typeof r.data?.token === 'string' && r.data.token.length > 20);
  token = r.data.token;

  const noAuth = await fetch(`${BASE}/api/factories`).then((r) => r.status);
  eq('sin token → 401', noAuth, 401);

  const me = await api('GET', '/api/auth/me');
  eq('/me con token → 200', me.status, 200);
  eq('  rol admin', me.data?.role, 'admin');
  eq('  id resuelto del claim sub', typeof me.data?.id, 'string');
}

/* ------------------------------------------------------------- Catálogos */

section('Catálogos');
const factories = (await api('GET', '/api/factories')).data.items;
const articles = (await api('GET', '/api/articles')).data.items;
const customers = (await api('GET', '/api/customers')).data.items;
eq('3 fábricas', factories.length, 3);
eq('9 artículos', articles.length, 9);
eq('3 clientes', customers.length, 3);

const fByTaxId = Object.fromEntries(factories.map((f) => [f.taxId, f]));
const aBySku = Object.fromEntries(articles.map((a) => [a.sku, a]));
const IMN = fByTaxId['B48123456'];
const QAC = fByTaxId['B76543210'];
const EEI = fByTaxId['B12345678'];
ok('fábrica IMN con comisión general 4%', IMN.defaultCommissionPct === 4);
ok('fábrica QAC con comisión general 6.5%', QAC.defaultCommissionPct === 6.5);
ok('fábrica EEI con comisión general 3.25%', EEI.defaultCommissionPct === 3.25);

const TORNILLO = aBySku['TORN-M8-40'].id;
const FILM = aBySku['FILM-RET-50'].id;
const CAJA = aBySku['CAJA-6040'].id;
const BOLSA = aBySku['BOLSA-AIR'].id;

/* ------------------------------ REGLA 1: vigencia por fecha ------------------------------ */

section('Regla 1 · el precio depende de la fecha');
{
  // IMN: línea CERRADA (01-01 → 01-07) sustituida por IMN-2026-B.
  const may = await api('GET', `/api/prices/resolve?factoryId=${IMN.id}&articleId=${TORNILLO}&at=2026-05-15`);
  eq('  IMN 2026-05-15 → tarifa A (0.12)', may.data.price.unitPrice, 0.12);
  eq('  ...en modo cerrado', may.data.price.validityMode, 'closed');

  const sep = await api('GET', `/api/prices/resolve?factoryId=${IMN.id}&articleId=${TORNILLO}&at=2026-09-27`);
  eq('  IMN 2026-09-27 → tarifa B (0.135)', sep.data.price.unitPrice, 0.135);
  eq('  ...en modo abierto (hasta nueva tarifa)', sep.data.price.validityMode, 'open');

  // QAC: corte limpio de calendario. validTo es EXCLUSIVO, así que la tarifa A
  // cubre el 31/05 y la B empieza el 01/06, sin huecos.
  const qMay = await api('GET', `/api/prices/resolve?factoryId=${QAC.id}&articleId=${TORNILLO}&at=2026-05-31`);
  eq('  QAC 2026-05-31 → tarifa A (0.10)', qMay.data.price.unitPrice, 0.1);
  eq('  ...en modo cerrado', qMay.data.price.validityMode, 'closed');
  const qJun = await api('GET', `/api/prices/resolve?factoryId=${QAC.id}&articleId=${TORNILLO}&at=2026-06-01`);
  eq('  QAC 2026-06-01 → tarifa B (0.11)', qJun.data.price.unitPrice, 0.11);
  eq('  ...en modo abierto', qJun.data.price.validityMode, 'open');

  const antes = await api('GET', `/api/prices/resolve?factoryId=${QAC.id}&articleId=${TORNILLO}&at=2025-12-31`);
  eq('  antes de la primera tarifa → found:false', antes.data.found, false);
  const nadie = await api('GET', `/api/prices/resolve?factoryId=${EEI.id}&articleId=${TORNILLO}&at=2026-09-27`);
  eq('  fábrica que no sirve el artículo → found:false', nadie.data.found, false);
  eq('  ...y price:null', nadie.data.price, null);

  // Comparativa entre fábricas: el mismo artículo, tresdates, tres precios.
  const ofQ = await api('GET', `/api/articles/${TORNILLO}/offers?at=2026-09-27`);
  eq('  el tornillo lo ofrecen 2 fábricas', ofQ.data.total, 2);
  eq('  ordenada de más barata a más cara', ofQ.data.items[0].unitPrice, 0.11);
  ok('  la primera es QAC', ofQ.data.items[0].factoryName === QAC.name);
}

/* ---------------------------- REGLA 3: reparto por fábrica ---------------------------- */

section('Regla 3 · un pedido se reparte en varias órdenes de servicio');
let orderId;
{
  // El tornillo lo sirven QAC (0.11) e IMN (0.135) → gana QAC.
  // El film lo sirven EEI (17.95) y QAC (19.90) → gana EEI.
  // La caja sólo la sirve EEI.
  const r = await api('POST', '/api/sales-orders', {
    customerId: customers[0].id,
    orderDate: '2026-09-27',
    lines: [
      { articleId: TORNILLO, qty: 1000 },
      { articleId: FILM, qty: 20 },
      { articleId: CAJA, qty: 50 },
    ],
  });
  eq('alta de pedido → 201', r.status, 201);
  orderId = r.data.id;
  ok('referencia autogenerada', /^P-\d{4}-\d{5}$/.test(r.data.reference), r.data.reference);

  const [tornillo, film, caja] = r.data.lines;
  eq('  tornillo 1000 ud a 0.11 = 110', tornillo.lineTotal, 110);
  eq('  ...asignado a la más barata (QAC)', tornillo.factoryName, QAC.name);
  eq('  film 20 ud a 17.95 = 359', film.lineTotal, 359);
  eq('  ...asignado a EEI (17.95 < 19.90)', film.factoryName, EEI.name);
  eq('  caja 50 ud a 1.35 = 67.5', caja.lineTotal, 67.5);
  eq('  subtotal 110 + 359 + 67.5 = 536.5', r.data.subtotal, 536.5);
  eq('  las 3 líneas van a 2 fábricas distintas', new Set(r.data.lines.map((l) => l.factoryId)).size, 2);

  // Un artículo sin ninguna tarifa vigente no deja crear el pedido.
  const roto = await api('POST', '/api/sales-orders', {
    customerId: customers[0].id,
    orderDate: '2020-01-01',
    lines: [{ articleId: TORNILLO, qty: 1 }],
  });
  eq('  fecha sin tarifa → 400', roto.status, 400);
}

/* ------------------------- REGLA 2: el precio se congela ------------------------- */

section('Regla 2 · cambiar una tarifa no altera el pedido');
{
  const antes = await api('GET', `/api/sales-orders/${orderId}`);
  eq('precio congelado antes de cambiar nada', antes.data.lines[0].unitPrice, 0.11);

  const listas = await api('GET', `/api/price-lists?factoryId=${IMN.id}&status=draft`);
  eq('IMN tiene 1 tarifa en borrador', listas.data.items.length, 1);
  const borrador = listas.data.items[0];
  eq('  es IMN-2026-C', borrador.code, 'IMN-2026-C');

  const act = await api('POST', `/api/price-lists/${borrador.id}/activate`, {});
  eq('  activar → 200', act.status, 200);
  eq('  queda publicada como activa', act.data.priceList.status, 'active');

  // La línea abierta de IMN-2026-B debe haberse cerrado sola el 2026-10-01.
  const hist = await api('GET', `/api/prices/history?factoryId=${IMN.id}&articleId=${TORNILLO}`);
  const lineaB = hist.data.items.find((r) => r.priceListCode === 'IMN-2026-B');
  eq('  IMN-2026-B quedó cerrada el 2026-10-01', lineaB.validTo, '2026-10-01');
  eq('  ...y ya no es una línea abierta', lineaB.validityMode, 'closed');

  // El histórico sigue resolviendo igual que antes de activarla.
  const sep = await api('GET', `/api/prices/resolve?factoryId=${IMN.id}&articleId=${TORNILLO}&at=2026-09-27`);
  eq('  2026-09-27 sigue resolviendo 0.135', sep.data.price.unitPrice, 0.135);
  const oct = await api('GET', `/api/prices/resolve?factoryId=${IMN.id}&articleId=${TORNILLO}&at=2026-10-15`);
  eq('  2026-10-15 ya resuelve 0.14 (IMN-2026-C)', oct.data.price.unitPrice, 0.14);

  const despues = await api('GET', `/api/sales-orders/${orderId}`);
  eq('el pedido mantiene su precio original', despues.data.lines[0].unitPrice, 0.11);
  eq('  ...y su subtotal', despues.data.subtotal, 536.5);
}

/* ------------------------- REGLA 4: comisión congelada por producto ------------------------- */

section('Regla 4 · la comisión se resuelve y congela por producto');
let qacSoId = null;
let eeiSoId = null;
{
  const conf = await api('POST', `/api/sales-orders/${orderId}/confirm`, {});
  eq('confirmar → 200', conf.status, 200);
  eq('  el pedido pasa a confirmed', conf.data.status, 'confirmed');
  eq('  2 órdenes de servicio creadas', conf.data.serviceOrderCount, 2);

  const list = await api('GET', `/api/service-orders?salesOrderId=${orderId}`);
  eq('  hay 2 órdenes de servicio', list.data.items.length, 2);
  const qac = list.data.items.find((s) => s.factoryId === QAC.id);
  const eei = list.data.items.find((s) => s.factoryId === EEI.id);
  ok('  una para QAC y otra para EEI', !!qac && !!eei);
  qacSoId = qac.id;
  eeiSoId = eei.id;

  // QAC sólo lleva el tornillo, que tiene override del 8% (general 6.5%).
  eq('  la orden QAC tiene 1 línea', qac.lines.length, 1);
  eq('  tornillo QAC usa el override (8%)', qac.lines[0].commissionPct, 8);
  near('    110 x 8% = 8.8', qac.lines[0].commissionAmount, 8.8);
  near('  comisión total de la orden QAC', qac.commissionTotal, 8.8);

  // EEI: film con override 4.75%, caja con la general 3.25%.
  const film = eei.lines.find((l) => l.articleSku === 'FILM-RET-50');
  const caja = eei.lines.find((l) => l.articleSku === 'CAJA-6040');
  eq('  film EEI usa el override (4.75%)', film.commissionPct, 4.75);
  near('    359 x 4.75% = 17.0525', film.commissionAmount, 17.0525);
  eq('  caja EEI usa la general (3.25%)', caja.commissionPct, 3.25);
  // 67.5 x 3.25% = 2.19375 exacto, redondeado a los 4 decimales de la política.
  near('    67.5 x 3.25% = 2.1938 (4 dp)', caja.commissionAmount, 2.1938);
  near('  comisión total de la orden EEI', eei.commissionTotal, 19.2463);

  // Confirmar dos veces no duplica órdenes.
  const otra = await api('POST', `/api/sales-orders/${orderId}/confirm`, {});
  eq('  confirmar de nuevo → 409 (ya no es draft)', otra.status, 409);
}

/* ------------------- Cambiar la comisión no altera lo ya congelado ------------------- */

section('Regla 4b · cambiar la comisión general no afecta a órdenes ya creadas');
{
  await api('PATCH', `/api/factories/${QAC.id}`, { defaultCommissionPct: 12 });
  const so = await api('GET', `/api/service-orders/${qacSoId}`);
  eq('  la orden QAC sigue al 8% original', so.data.lines[0].commissionPct, 8);
  await api('PATCH', `/api/factories/${QAC.id}`, { defaultCommissionPct: 6.5 });

  // Un pedido nuevo sí recoge la comisión nueva. Usamos el bidón, que sólo
  // sirve QAC, para que la asignación de fábrica no ambigüe el resultado.
  const nuevo = await api('POST', '/api/sales-orders', {
    customerId: customers[2].id,
    orderDate: '2026-09-27',
    lines: [{ articleId: aBySku['BIDON-200'].id, qty: 10 }],
  });
  await api('POST', `/api/sales-orders/${nuevo.data.id}/confirm`, {});
  const l = await api('GET', `/api/service-orders?salesOrderId=${nuevo.data.id}`);
  eq('  el pedido nuevo va a 1 fábrica', l.data.items.length, 1);
  eq('  ...que es QAC', l.data.items[0].factoryId, QAC.id);
  eq('  y usa la comisión vigente (12%)', l.data.items[0].lines[0].commissionPct, 12);
  await api('PATCH', `/api/factories/${QAC.id}`, { defaultCommissionPct: 6.5 });
}

/* ------------------- REGLA 6: verificación agrupada ------------------- */

section('Regla 6 · verificación agrupada');
{
  const sinEnviar = await api('POST', `/api/service-orders/${qacSoId}/verify`, {
    receivedAt: '2026-09-27',
    result: 'ok',
  });
  eq('  verificar sin haber enviado → 409', sinEnviar.status, 409);

  const salto = await api('POST', `/api/service-orders/${qacSoId}/ship`, {});
  eq('  saltar de draft a shipped → 409', salto.status, 409);

  for (const id of [qacSoId, eeiSoId]) {
    await api('POST', `/api/service-orders/${id}/send`, {});
    await api('POST', `/api/service-orders/${id}/ship`, {});
    await api('POST', `/api/service-orders/${id}/deliver`, {});
  }

  // Cantidades que no cuadran no pueden marcarse como "ok".
  // Se prueba ANTES del lote correcto: si no, la orden ya estaría verificada.
  const eei = await api('GET', `/api/service-orders/${eeiSoId}`);
  const descuadre = await api('POST', '/api/service-orders/verify-batch', {
    serviceOrderIds: [eeiSoId],
    receivedAt: '2026-09-27',
    result: 'ok',
    lines: [{ lineId: eei.data.lines[0].id, qtyReceived: 1 }],
  });
  eq('  descuadre + resultado "ok" → 400', descuadre.status, 400);
  ok('  ...y explica el descuadre', /no cuadran/i.test(descuadre.data?.error?.message ?? ''));

  const lineaAjena = await api('POST', '/api/service-orders/verify-batch', {
    serviceOrderIds: [eeiSoId],
    receivedAt: '2026-09-27',
    result: 'ok',
    lines: [{ lineId: 'no-existe', qtyReceived: 1 }],
  });
  eq('  línea que no es de la orden → 400', lineaAjena.status, 400);

  const lote = await api('POST', '/api/service-orders/verify-batch', {
    serviceOrderIds: [qacSoId, eeiSoId],
    receivedAt: '2026-09-27',
    result: 'ok',
    notes: 'Recepción correcta del lote semanal',
  });
  eq('  verificación agrupada de 2 órdenes → 200', lote.status, 200);
  ok('  genera un lote numerado', /^VB-\d{4}-\d{5}$/.test(lote.data.reference), lote.data.reference);
  eq('  las 2 quedan verificadas OK', lote.data.counts.verified_ok, 2);

  const loteDup = await api('POST', '/api/service-orders/verify-batch', {
    serviceOrderIds: [qacSoId, qacSoId],
    receivedAt: '2026-09-27',
    result: 'ok',
  });
  eq('  ids repetidos → 400', loteDup.status, 400);

  const loteOk = await api('POST', '/api/service-orders/verify-batch', {
    serviceOrderIds: [qacSoId],
    receivedAt: '2026-09-27',
    result: 'ok',
  });
  eq('  reverificar una orden ya OK → 409', loteOk.status, 409);

  const lotes = await api('GET', '/api/verification-batches');
  ok('  el lote queda registrado y es consultable', lotes.data.total >= 1);
}

/* ------------------- REGLA 5 + 6: factura agrupada ------------------- */

section('Regla 5+6 · factura de comisión agrupada');
{
  const vacia = await api('POST', '/api/commission-invoices', {
    factoryId: QAC.id,
    serviceOrderIds: [],
  });
  eq('  sin órdenes → 400', vacia.status, 400);

  const cruzada = await api('POST', '/api/commission-invoices', {
    factoryId: QAC.id,
    serviceOrderIds: [qacSoId, eeiSoId],
  });
  eq('  mezclar fábricas → 400', cruzada.status, 400);
  ok('  ...y lo explica', /misma fábrica/i.test(cruzada.data?.error?.message ?? ''));

  const r = await api('POST', '/api/commission-invoices', {
    factoryId: QAC.id,
    serviceOrderIds: [qacSoId],
    issueDate: '2026-09-27',
  });
  eq('  factura de QAC → 201', r.status, 201);
  const invId = r.data.id;
  ok('  numeración correlativa', /^F-\d{4}-\d{5}$/.test(r.data.number), r.data.number);
  eq('  IVA por defecto 0% (exportación Canarias→Península)', r.data.taxPct, 0);
  near('  subtotal = comisión de la orden', r.data.subtotal, 8.8);
  near('  total = subtotal + IVA', r.data.total, 8.8);
  eq('  una línea por orden agrupada', r.data.lines.length, 1);
  eq('  y la referencia a la orden', r.data.serviceOrders.length, 1);
  ok('  la descripción cita cliente y pedido', /cliente/i.test(r.data.lines[0].description));

  const dup = await api('POST', '/api/commission-invoices', {
    factoryId: QAC.id,
    serviceOrderIds: [qacSoId],
  });
  eq('  facturar dos veces la misma orden → 409', dup.status, 409);

  const soTras = await api('GET', `/api/service-orders/${qacSoId}`);
  eq('  la orden pasa a invoiced', soTras.data.status, 'invoiced');
  eq('  ...y enlaza con su factura', soTras.data.invoiceId, invId);

  const issued = await api('POST', `/api/commission-invoices/${invId}/issue`, {});
  eq('  emitir → issued', issued.data.status, 'issued');
  const paid = await api('POST', `/api/commission-invoices/${invId}/pay`, {});
  eq('  marcar pagada → paid', paid.data.status, 'paid');
  const reemit = await api('POST', `/api/commission-invoices/${invId}/issue`, {});
  eq('  volver a emitir una factura pagada → 409', reemit.status, 409);
}

/* ------------------- Cancelar libera las órdenes ------------------- */

section('Regla 5b · cancelar una factura libera las órdenes');
{
  const inv = await api('POST', '/api/commission-invoices', {
    factoryId: EEI.id,
    serviceOrderIds: [eeiSoId],
    issueDate: '2026-09-27',
  });
  eq('  factura de EEI → 201', inv.status, 201);
  near('  subtotal = comisión de la orden EEI', inv.data.subtotal, 19.2463);
  eq('  una orden agrupada', inv.data.serviceOrders.length, 1);

  const cancel = await api('POST', `/api/commission-invoices/${inv.data.id}/cancel`, {});
  eq('  cancelar → cancelled', cancel.data.status, 'cancelled');

  const so = await api('GET', `/api/service-orders/${eeiSoId}`);
  eq('  la orden vuelve a verified_ok', so.data.status, 'verified_ok');
  eq('  ...y queda sin factura', so.data.invoiceId, null);

  const otra = await api('POST', '/api/commission-invoices', {
    factoryId: EEI.id,
    serviceOrderIds: [eeiSoId],
    issueDate: '2026-09-27',
    taxPct: 21,
  });
  eq('  y se puede volver a facturar', otra.status, 201);
  eq('  ahora con IVA 21%', otra.data.taxPct, 21);
  // 19.2463 x 21% = 4.0417 exacto a 4 dp; el total también se redondea a 4 dp.
  near('  IVA = subtotal x 21%', otra.data.taxTotal, 4.0417);
  near('  total = subtotal + IVA', otra.data.total, 23.288);
}

/* ------------------------------- Dashboard ------------------------------- */

section('Dashboard');
{
  const d = await api('GET', '/api/dashboard');
  eq('  → 200', d.status, 200);
  ok('  comisión devengada > 0', d.data.commissionAccrued > 0, String(d.data.commissionAccrued));
  ok('  comisión facturada > 0', d.data.commissionInvoiced > 0, String(d.data.commissionInvoiced));
  eq('  3 fábricas activas', d.data.activeFactories, 3);
  eq('  9 artículos activos', d.data.activeArticles, 9);
  ok('  hay estados de órdenes de servicio', Object.keys(d.data.serviceOrdersByStatus).length > 0);
}

/* --------------------------------- Resultado --------------------------------- */

console.log(`\n${'='.repeat(46)}`);
console.log(`  ${pass} correctos, ${fail} fallidos`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
