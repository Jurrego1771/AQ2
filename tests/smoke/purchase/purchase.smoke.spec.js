// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * @smoke @purchase — La sección Purchases del detalle de un customer carga.
 *
 * Purchase no tiene pantalla propia: vive embebido en /customer/:id
 * (sm="div-purchases" + data-name="purchases-list"). Deriva un customer real del
 * entorno. Sin data transaccional en dev, se valida que la sección carga con su
 * tabla (estado vacío incluido) — ver GAP PUR-RISK-1.
 */
test.describe('Purchase — sección en el detalle del customer @smoke @purchase', () => {
  test('la sección Purchases del customer carga con su tabla @PUR-TC-5', async ({ api, customerDetailPage }) => {
    const list = await api.get('/api/customer?limit=1');
    const customerId = ((await list.json()).data || [])[0]?._id;
    test.skip(!customerId, 'no hay customers en el entorno');

    await customerDetailPage.goto(customerId);
    await expect(customerDetailPage.purchasesSection).toBeVisible();
    await expect(customerDetailPage.purchasesList).toBeVisible();
    // La tabla existe y responde (con data o con el estado vacío "No purchases...").
    expect(await customerDetailPage.purchaseRowCount()).toBeGreaterThanOrEqual(1);
  });
});
