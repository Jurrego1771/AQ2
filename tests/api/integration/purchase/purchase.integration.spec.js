// @ts-check
const { test, expect } = require('../../../../src/fixtures');

/**
 * @api @purchase — Contrato de lectura del recurso purchase (US-039).
 *
 * Purchase es un sub-recurso del customer (CustomerPurchase): compras/suscripciones
 * con pagos por gateway. Dominio sensible (pagos reales): cobertura SOLO de LECTURA
 * y contrato de errores — NO se crean compras ni se tocan gateways.
 *
 * Endpoint: GET /api/customer/:customer_id/purchase (+ filtros status/type/product,
 * detalle /purchase/:id). Contrato verificado en vivo 2026-07-14.
 *
 * NOTA (GAP PUR-RISK-1): dev no tiene customers con compras (escaneados 100), así que
 * la lectura de compras REALES no se puede asertar; se cubre el contrato de errores y
 * el estado vacío (data:[]), que sí son verificables. Deriva el customer del entorno.
 */
test.describe('Purchase — contrato de lectura @api @purchase', () => {
  /** Devuelve el _id de un customer real del entorno (no hardcodea). */
  async function anyCustomerId(api) {
    const res = await api.get('/api/customer?limit=1');
    expect(res.ok(), `GET /api/customer: ${res.status()}`).toBeTruthy();
    const c = ((await res.json()).data || [])[0];
    return c?._id;
  }

  test('GET purchase de un customer real responde 200 con data array @PUR-TC-1', async ({ api }) => {
    const customerId = await anyCustomerId(api);
    test.skip(!customerId, 'no hay customers en el entorno');
    const res = await api.get(`/api/customer/${customerId}/purchase`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET purchase acepta filtros (status/limit) sin error @PUR-TC-2', async ({ api }) => {
    const customerId = await anyCustomerId(api);
    test.skip(!customerId, 'no hay customers en el entorno');
    const res = await api.get(`/api/customer/${customerId}/purchase?status=SUCCESS&limit=5`);
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('GET purchase de un customer inexistente responde 404 CUSTOMER_NOT_FOUND @PUR-TC-3', async ({ api }) => {
    const res = await api.get('/api/customer/000000000000000000000000/purchase');
    expect(res.status()).toBe(404);
    expect((await res.json()).data).toBe('CUSTOMER_NOT_FOUND');
  });

  test('GET detalle de una purchase inexistente responde 404 PURCHASE_NOT_FOUND @PUR-TC-4', async ({ api }) => {
    const customerId = await anyCustomerId(api);
    test.skip(!customerId, 'no hay customers en el entorno');
    const res = await api.get(`/api/customer/${customerId}/purchase/000000000000000000000000`);
    expect(res.status()).toBe(404);
    expect((await res.json()).data).toBe('PURCHASE_NOT_FOUND');
  });
});
