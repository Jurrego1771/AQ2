// @ts-check
require('dotenv').config();

/**
 * Resuelve la configuración del entorno objetivo a partir de ENV y las
 * variables por-ambiente del .env (BASE_URL_DEV, TEST_USER_DEV, ...).
 *
 * ENV admite: dev | qa | prod-us | prod-eu. El sufijo se normaliza a
 * MAYÚSCULAS con guiones a guion_bajo (prod-us -> PROD_US).
 */
const ENV = (process.env.ENV || 'dev').toLowerCase();
const SUFFIX = ENV.toUpperCase().replace(/-/g, '_');

/** Lee `${prefix}_${SUFFIX}` y cae al fallback global si está vacío. */
function pick(prefix, fallback = '') {
  return process.env[`${prefix}_${SUFFIX}`] || fallback;
}

const env = {
  name: ENV,
  baseURL: pick('BASE_URL'),
  user: pick('TEST_USER', process.env.TEST_USER || ''),
  pass: pick('TEST_PASS', process.env.TEST_PASS || ''),
  // Segundo usuario (misma cuenta): solo para probar edicion concurrente
  // entre dos sesiones reales (alerta "changed by another user", sm2#8317).
  user2: pick('TEST_USER2'),
  pass2: pick('TEST_PASS2'),
  totpSecret: pick('TOTP_SECRET'),
  // API token de cuenta (Settings > API). Algunos endpoints (ej. el CRUD de
  // /api/show) exigen el header X-API-TOKEN y rechazan la cookie de sesión del
  // login UI (401). Lo consume el fixture `apiToken`. Acepta sufijo por-env
  // (API_TOKEN_DEV) y cae al global API_TOKEN.
  apiToken: pick('API_TOKEN', process.env.API_TOKEN || ''),
  // prod-us / prod-eu bloquean mutaciones (prodGuard en specs que escriben).
  isProd: ENV.startsWith('prod'),
  // Token Profiles (sm2#8451): ids de TokenProfile pre-creados una sola vez por un
  // admin de plataforma (is_admin) -> ver .env.example. Con esos ids + el módulo de
  // cuenta api_tokens habilitado, AQ2 puede crear/borrar sus propios tokens self-
  // contained por test (POST /api/account/token no exige is_admin para el campo
  // profile, solo la UI lo hace). Vacíos -> los specs de token profile se skipean.
  tokenProfileIdWithCategory: pick('TOKEN_PROFILE_ID_WITH_CATEGORY'),
  tokenProfileIdWithoutCategory: pick('TOKEN_PROFILE_ID_WITHOUT_CATEGORY'),
};

module.exports = { env };
