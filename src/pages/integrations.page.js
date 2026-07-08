// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object de Settings > Integrations (vista settings/integrations.coffee,
 * ruta /settings/integrations). Foco: integración de pagos **Stripe** (PR sm2#8481).
 *
 * REGLA sm:: se usa sm() donde la marca existe (save, global-alert). Los
 * controles de Stripe NO exponen marca sm: (bug AQ2#39): se localizan por su
 * atributo funcional `data-name`, como excepción documentada — mismo precedente
 * que el <select> de items-por-página en Media (AQ2#11). Un rename del data-name
 * rompería estos selectores; el fix es agregar marcas sm: a los controles Stripe.
 */
class IntegrationsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Acciones/estado con marca sm: estable.
    this.save = page.locator(sm('save'));
    // Alert global reutilizado por toda la pantalla para warnings/errores.
    this.globalAlert = page.locator(sm('global-alert'));

    // --- Stripe (sin marca sm:, ver AQ2#39) ---
    // El "Enabled" es un bootstrap-toggle: el checkbox real queda OCULTO y su
    // estado lo fija el JS tras el XHR de la cuenta. Se opera por el widget
    // visible `.toggle` (no por el input oculto, que no es clickeable).
    this.stripeEnabled = page.locator('[data-name="payments-stripe-enabled"]');
    this.stripeEnabledToggle = page.locator('.toggle:has([data-name="payments-stripe-enabled"])');
    this.stripeApiKey = page.locator('[data-name="payments-stripe-api-key"]');
  }

  async goto() {
    await this.page.goto('/settings/integrations');
  }

  /**
   * Deja Stripe activado con la API Key vacía (estado que dispara la validación).
   *
   * Robustez y SEGURIDAD (cuenta compartida de dev):
   * - Espera a que el XHR de la cuenta asiente (bootstrap-toggle inicializado y
   *   Stripe reflejando su estado persistido = activado). Sin esta espera, el XHR
   *   repuebla el campo key DESPUÉS del fill('') y el guard no dispararía -> se
   *   haría un POST real que muta la cuenta.
   * - Precondición: la cuenta de dev tiene Stripe activado de forma persistente.
   *   Si no lo estuviera, el waitForFunction expira y el test falla claramente
   *   (sin disparar un POST accidental).
   */
  async enableStripeWithoutKey() {
    await this.stripeEnabledToggle.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () => {
        const cb = document.querySelector('[data-name="payments-stripe-enabled"]');
        return !!cb && cb.checked === true;
      },
      null,
      { timeout: 10_000 }
    );
    await this.stripeApiKey.fill('');
  }
}

module.exports = { IntegrationsPage };
