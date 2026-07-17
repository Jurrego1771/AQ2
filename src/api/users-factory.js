// @ts-check

/**
 * Factory self-contained para /api/user.
 *
 * Resuelve CAT-RISK-6 en dev/qa: el bot QA no puede actualizar SU PROPIO user
 * record (POST /api/user/<bot-id> devuelve 500 DB_ERROR), pero SI puede:
 *   - POST /api/user          -> crear un user NUEVO con email unico (200 OK)
 *   - POST /api/user/<nuevo>  -> actualizar el user recién creado (200 OK)
 *   - DELETE /api/user/<nuevo> -> borrarlo (200 OK, GET siguiente = 404)
 *
 * El 500 del bot himself es especifico a su propio record (probablemente
 * porque el handler tiene una rama "no te podés sacar a vos mismo de admins"
 * que rompe contra Mongo cuando el user es account_admin y tiene __v alto).
 * Verificado en vivo 2026-07-15: para CUALQUIER user nuevo creado por el bot
 * el ciclo POST/POST/DELETE funciona limpio.
 *
 * Detalle de campos que el server ACEPTA vs IGNORA en POST /api/user
 * (verificado en vivo):
 *   ACEPTADOS al crear: first_name, last_name, email, password, accounts[],
 *                        categories[], can_access_uncategorized_content, totp
 *   IGNORADOS al crear: permissions (todo el objeto; queda en 0),
 *                        is_account_admin (queda false),
 *                        is_link_admin / is_cdn_admin / is_sales_admin / etc.
 *                        (quedan false)
 *   Para setear permissions o is_account_admin hay que hacer un POST /api/user/:id
 *   posterior — eso lo hace setUserPermissions() / promoteUserToAdmin() aqui abajo.
 *
 * Uso típico (en fixtures o tests):
 *   const id = await createUser(api, {
 *     email: `qa-${Date.now()}@mediastre.am`,
 *     password: 'ProbePass#1234',
 *     categories: [parentId],
 *   });
 *   cleaner.register('user', id);
 *
 *   // update posterior si hace falta:
 *   await setUserPermissions(api, id, { category: { level: 3 } });
 */

/**
 * @typedef {import('@playwright/test').APIRequestContext} ApiCtx
 * @typedef {{
 *   first_name?: string,
 *   last_name?: string,
 *   email: string,
 *   password: string,
 *   accounts?: string[],
 *   categories?: string[],
 *   can_access_uncategorized_content?: boolean,
 * }} CreateUserOpts
 */

/**
 * Crea un user via POST /api/user. Devuelve el _id (string).
 * Lanza si el server no devuelve id (útil para fallar rapido en setup).
 *
 * @param {ApiCtx} api
 * @param {CreateUserOpts} opts
 * @returns {Promise<string>}
 */
async function createUser(api, opts) {
  if (!opts.email) throw new Error('createUser: opts.email es requerido');
  if (!opts.password) throw new Error('createUser: opts.password es requerido');

  const payload = {
    first_name: opts.first_name || 'QA',
    last_name: opts.last_name || 'Auto',
    email: opts.email,
    password: opts.password,
  };
  if (opts.accounts) payload.accounts = opts.accounts;
  if (opts.categories) payload.categories = opts.categories;
  if (typeof opts.can_access_uncategorized_content === 'boolean') {
    payload.can_access_uncategorized_content = opts.can_access_uncategorized_content;
  }

  const res = await api.post('/api/user', { data: payload });
  if (!res.ok()) {
    throw new Error(
      `createUser fallo: HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`
    );
  }
  const body = await res.json();
  const id = body?.data?._id || body?.data?.id;
  if (!id) {
    throw new Error(`createUser: respuesta sin _id: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return id;
}

/**
 * POST /api/user/:id setea categories[] del user (reemplazo total del array).
 * Verificado en vivo: para users NUEVOS (no el bot) responde 200 OK con el user
 * actualizado. Retry ante 5xx transient (mismo patron que live-stream-factory).
 *
 * @param {ApiCtx} api
 * @param {string} userId
 * @param {string[]} categoryIds
 */
async function setUserCategories(api, userId, categoryIds) {
  const TRANSIENT = new Set([502, 503, 504]);
  const MAX_RETRIES = 2;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const res = await api.post(`/api/user/${userId}`, { data: { categories: categoryIds } });
    if (res.ok()) return await res.json();
    const status = res.status();
    const body = await res.text();
    lastErr = `HTTP ${status} ${body.slice(0, 120)}`;
    if (!TRANSIENT.has(status) || attempt === MAX_RETRIES) {
      throw new Error(`setUserCategories fallo: ${lastErr}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
  }
  throw new Error(`setUserCategories: agoto reintentos (${lastErr})`);
}

/**
 * POST /api/user/:id setea permissions (merge sobre las existentes; el server
 * hace un update parcial). Importante: el server IGNORA permissions al CREAR
 * el user (siempre arranca en 0 across the board); recien este POST los
 * respeta. Usado en fixtures que necesitan, p.ej., category.write.
 *
 * Ejemplo:
 *   await setUserPermissions(api, id, { category: { level: 3 } });
 *
 * @param {ApiCtx} api
 * @param {string} userId
 * @param {Record<string,{level:number}>} perms
 */
async function setUserPermissions(api, userId, perms) {
  const res = await api.post(`/api/user/${userId}`, { data: { permissions: perms } });
  if (!res.ok()) {
    throw new Error(
      `setUserPermissions fallo: HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`
    );
  }
  return await res.json();
}

/**
 * DELETE /api/user/:id. Idempotente: 200 si existe, 404 si ya no esta.
 *
 * @param {ApiCtx} api
 * @param {string} userId
 */
async function deleteUser(api, userId) {
  const res = await api.delete(`/api/user/${userId}`);
  if (res.ok() || res.status() === 404) return;
  throw new Error(`deleteUser fallo: HTTP ${res.status()} ${await res.text()}`);
}

module.exports = {
  createUser,
  setUserCategories,
  setUserPermissions,
  deleteUser,
};
