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
  totpSecret: pick('TOTP_SECRET'),
  // prod-us / prod-eu bloquean mutaciones (prodGuard en specs que escriben).
  isProd: ENV.startsWith('prod'),
};

module.exports = { env };
