// @ts-check
const { test, expect } = require('../../../src/fixtures');

/**
 * Regresión UI — Integrations / Stripe (@regression @integrations).
 *
 * Protege las dos mejoras de UX del PR mediastream/sm2#8481 (ya desplegadas en
 * dev v7.0.70), como red anti-regresión:
 *  1. El placeholder del Secret Key no tiene forma de token real.
 *  2. Activar Stripe con la API Key vacía muestra un warning específico y NO
 *     envía el request al backend (la validación cliente corta antes del POST).
 *
 * Ambos casos son VERDES (comportamiento correcto a proteger). No hay prueba viva:
 * la exploración confirmó que el fix funciona. El único gap abierto es de
 * testabilidad (controles Stripe sin marca sm:, AQ2#39) — ver POM.
 *
 * Seguridad: TC-2 deja Stripe activado + key vacía y guarda; el guard cliente
 * bloquea el POST, así que NO se persiste nada en la cuenta compartida de dev
 * (verificado en exploración). Cada test recarga con estado limpio del servidor.
 */
test.describe('Integrations UI — validación de Stripe @regression @integrations', () => {
  // Forma de una API Key real de Stripe: sk_live_/sk_test_ + cadena alfanumérica.
  const REAL_STRIPE_KEY = /^sk_(live|test)_[A-Za-z0-9]{16,}$/;

  test.beforeEach(async ({ integrationsPage }) => {
    await integrationsPage.goto();
  });

  test('el placeholder del Secret Key no tiene forma de token real @INTG-TC-1', async ({
    integrationsPage,
  }) => {
    await expect(integrationsPage.stripeApiKey).toBeVisible();
    const placeholder = await integrationsPage.stripeApiKey.getAttribute('placeholder');
    expect(placeholder, 'debe existir un placeholder').toBeTruthy();
    expect(
      placeholder,
      'el placeholder no debe parecer una API Key real cargada (confunde al usuario)'
    ).not.toMatch(REAL_STRIPE_KEY);
  });

  test('activar Stripe sin API Key muestra un warning y no envía el request @INTG-TC-2', async ({
    integrationsPage,
    page,
  }) => {
    // Registrar cualquier POST a /api/account: el guard cliente debe evitarlo.
    /** @type {string[]} */
    const accountPosts = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/account')) accountPosts.push(req.url());
    });

    await integrationsPage.enableStripeWithoutKey();

    // SEGURIDAD: solo guardamos si el estado gatillo realmente se sostiene
    // (Stripe activo + key vacía). Si no, fallamos ANTES de guardar para no
    // disparar un POST que mute la cuenta compartida de dev.
    await expect(integrationsPage.stripeApiKey).toHaveValue('');
    expect(await integrationsPage.stripeEnabled.evaluate((el) => el.checked)).toBe(true);

    await integrationsPage.save.click();

    // El warning específico aparece en el alert global (marca sm: estable).
    await expect(integrationsPage.globalAlert).toBeVisible();
    await expect(integrationsPage.globalAlert).toContainText(/Stripe API Key is required/i);

    // La validación cliente corta antes del POST: no debe haber request a la API.
    expect(accountPosts, 'la validación cliente debe evitar el POST a /api/account').toHaveLength(0);
  });
});
