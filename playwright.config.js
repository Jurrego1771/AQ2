// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { env } = require('./src/utils/env');

const BASE_URL = env.baseURL || 'http://localhost:3000';
const isCI = !!process.env.CI;

/**
 * Configuración Playwright — JS plano (sin TypeScript).
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  // Genera QA_RUN_ID una sola vez por corrida; lo consumen qaName() y el
  // sweep global. Ver knowledge-core/cross-cutting/test-provisioning/overview.md.
  globalSetup: './src/fixtures/global-setup.js',
  // Safety net (Capa 4): barre [QA-AUTO][run=<runId>] no limpiados per-test.
  // Best-effort, idempotente, skip en prod.
  globalTeardown: './src/fixtures/global-teardown.js',
  // Falla el build si quedó un test.only olvidado en CI.
  forbidOnly: isCI,
  fullyParallel: true,
  // 1 retry local: estos E2E corren contra un entorno dev compartido; la
  // lentitud transitoria bajo carga no debe romper una corrida (no enmascara
  // bugs: una falla real falla en ambos intentos). En CI, 2.
  retries: isCI ? 2 : 1,
  workers: isCI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },

  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Genera el storageState de login una sola vez (ver src/fixtures/auth.setup.js).
    { name: 'setup', testDir: './src/fixtures', testMatch: /.*\.setup\.js/ },

    {
      name: 'smoke',
      testDir: './tests/smoke',
      grep: /@smoke/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'api',
      testDir: './tests/api',
      grep: /@api/,
      // No necesita navegador propio, pero el fixture `api` se autentica por
      // sesión (storageState .auth/user.json) -> debe correr DESPUÉS de setup
      // (que hace el login y escribe ese archivo). Sin esta dependencia, en un
      // entorno limpio (CI) los tests api arrancan antes del login -> ENOENT.
      dependencies: ['setup'],
    },
    {
      name: 'unit',
      testDir: './tests/unit',
      grep: /@unit/,
      // Tests puros de infra (sin servidor, sin auth). El más rápido de todos.
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      grep: /@e2e/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'regression',
      testDir: './tests/regression',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
  ],
});
