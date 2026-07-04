// @ts-check

/**
 * Crea un APIRequestContext autenticado como un SEGUNDO usuario (sesión y
 * cookies propias, independientes del fixture `api`/storageState del usuario
 * principal). Login real vía POST /login -mismo endpoint que usa el form de
 * la UI, ver src/fixtures/auth.setup.js para la variante por navegador.
 *
 * Uso: probar comportamiento de edición concurrente entre dos usuarios reales
 * (ej. la alerta "changed by another user", sm2#8317). Requiere que el
 * segundo usuario ya exista en el entorno (no lo crea).
 *
 * @param {import('@playwright/test').Playwright} playwright
 * @param {{baseURL: string, user: string, pass: string}} creds
 * @returns {Promise<import('@playwright/test').APIRequestContext>}
 */
async function loginAsSecondUser(playwright, { baseURL, user, pass }) {
  const ctx = await playwright.request.newContext({ baseURL });
  await ctx.post('/login', { form: { username: user, password: pass, withJWT: 'true' } });

  // /login siempre redirige con 200 final (éxito -> "/", error -> "/?loginerror");
  // el status no distingue el resultado. Verificar contra un endpoint autenticado.
  const check = await ctx.get('/api/account');
  if (!check.ok()) {
    await ctx.dispose();
    throw new Error(
      `login del segundo usuario (${user}) falló: /api/account respondió ${check.status()}. ` +
        'Verificar TEST_USER2_<ENV>/TEST_PASS2_<ENV> en .env.'
    );
  }
  return ctx;
}

module.exports = { loginAsSecondUser };
