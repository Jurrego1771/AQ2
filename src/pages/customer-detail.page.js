// @ts-check
const { sm, dataName } = require('../utils/selectors');

/**
 * Page Object del detalle de Customer (/customer/:id) — foco en las secciones
 * embebidas de Purchases y Payments (módulo purchase, prefijo PUR).
 *
 * Marcas cosechadas en vivo 2026-07-14 (views/customer.coffee): la sección usa
 * `sm="div-purchases"` para el contenedor y `data-name="purchases-list"` para la
 * tabla (data-name es contrato estable de facto, ver CLAUDE.md).
 */
class CustomerDetailPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.purchasesSection = page.locator(sm('div-purchases'));
    this.purchasesList = page.locator(dataName('purchases-list'));
    this.paymentsList = page.locator(dataName('payments-list'));
  }

  /** Navega al detalle de un customer y espera la sección de compras visible. */
  async goto(customerId) {
    await this.page.goto(`/customer/${customerId}`);
    await this.purchasesSection.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** @returns {Promise<number>} filas de datos (excluye el header) en la tabla de compras. */
  async purchaseRowCount() {
    return this.purchasesList.locator('tr').count();
  }

  /** @returns {Promise<string>} texto de la tabla de compras (para el estado vacío). */
  async purchasesText() {
    return (await this.purchasesList.innerText()).trim();
  }
}

module.exports = { CustomerDetailPage };
