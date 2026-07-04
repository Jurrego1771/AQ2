// @ts-check
const { test, expect } = require('../../src/fixtures');

/**
 * API — Account: feed DFP ante cuenta inexistente no debe crashear (@api @account).
 *
 * Prueba viva del fix de mediastream/sm2#8423 (issue #8417, "Mitigación de
 * errores en Cloud Watch"). Antes del fix, `account?.dfp?.enabled` era
 * `account.dfp?.enabled` -> con un account_id inexistente, `account` es
 * `null` y el acceso a `.dfp` lanzaba `Cannot read properties of null`. El
 * fix agrega el optional chaining y cae al branch existente que responde
 * 200 con `{status:401, data:'Not Allowed'}` (ese body con status:401 sin
 * setear el HTTP status real es un contrato pre-existente, no introducido
 * por este fix -no es lo que se prueba aquí-).
 *
 * Lectura pura, sin efectos secundarios: se ejecuta en cualquier entorno.
 */
test.describe('Account API — feed DFP @api @account', () => {
  test('GET /:account_id/dfp/full con account_id inexistente no crashea @ACC-TC-1', async ({
    api,
  }) => {
    const res = await api.get('/api/account/000000000000000000000000/dfp/full');
    expect(res.status(), 'no debería crashear ante una cuenta inexistente').toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 401, data: 'Not Allowed' });
  });
});
