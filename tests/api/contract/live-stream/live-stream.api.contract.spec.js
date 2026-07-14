// @ts-check
const { test, expect } = require('../../../../src/fixtures');
const { env } = require('../../../../src/utils/env');

/**
 * @api — Contrato HTTP del recurso Live Stream.
 *
 * Estado 2026-07-09: el archivo contenia 4 tests de contrato (LIVE-TC-CRT/GET/
 * LST/404) que fueron ELIMINADOS por estar mal numerados (no siguen la regla
 * `LIVE-TC-<n>` del proyecto) y por ser obsoletos (los AC equivalentes ya estaban
 * cubiertos por las pruebas de integracion LIVE-TC-5..7 y contract en Zod). El
 * sub-recurso `live-stream` sigue cubierto por:
 *  - integration: tests/api/live-stream.api.spec.js (LIVE-TC-5..7)
 *  - regression:  tests/regression/live-stream-*.regression.spec.js
 *
 * Si en el futuro se quiere re-introducir contrato HTTP con Zod aqui, usar los
 * IDs LIVE-TC-21..24 ya reservados en knowledge-core (ver tests.yaml).
 */
test.describe('Live Stream API @api - Contract (placeholder)', () => {
  test.skip(env.isProd, 'prodGuard');
  // Sin tests en vivo: el contrato HTTP se valida por integracion. Ver
  // tests/api/live-stream.api.spec.js y tests/api/contract/* si reactiva.
});
