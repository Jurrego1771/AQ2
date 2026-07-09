// @ts-check
const { newRunId } = require('../utils/qa-name');

/**
 * globalSetup — AQ2.
 *
 * Genera un runId (6 hex) por corrida y lo expone en `process.env.QA_RUN_ID`.
 * Todos los workers del run lo heredan (Playwright propaga process.env a
 * workers), lo que permite:
 *   - tag de correlación en nombres `[QA-AUTO][run=<id>]`
 *   - sweep por nombre en globalTeardown (Capa 4 de la estrategia)
 *   - correlación entre logs/reportes
 *
 * Si ya viene seteado (re-ejecución desde CI con runId forzado), lo respeta.
 *
 * Playwright invoca el default export como setup global (no es un test).
 * Ver: https://playwright.dev/docs/test-global-setup-teardown
 *
 * Idempotente y barato: no toca el entorno, no requiere storageState.
 */
module.exports = async function globalSetup() {
  if (!process.env.QA_RUN_ID || !/^[0-9a-f]{6}$/.test(process.env.QA_RUN_ID)) {
    process.env.QA_RUN_ID = newRunId();
  }
  // eslint-disable-next-line no-console
  console.log(`[AQ2 globalSetup] runId=${process.env.QA_RUN_ID}`);
};