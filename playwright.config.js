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
      // El grueso de las pruebas API no necesita navegador.
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
