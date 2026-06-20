// @ts-check
const base = require('@playwright/test');
const { MediaPage } = require('../pages/media.page');
const { MediaClient } = require('../api/media.client');
const { BaseClient } = require('../api/base.client');

/**
 * Fixtures compartidas: inyectan Page Objects y clientes API ya listos.
 * Uso en specs:  const { test, expect } = require('../../src/fixtures');
 */
const test = base.test.extend({
  // Page Object de Media
  mediaPage: async ({ page }, use) => {
    await use(new MediaPage(page));
  },

  // Cliente API autenticado, reutiliza el storageState del login.
  apiContext: async ({}, use) => {
    const ctx = await BaseClient.newContext();
    await use(ctx);
    await ctx.dispose();
  },

  mediaClient: async ({ apiContext }, use) => {
    await use(new MediaClient(apiContext));
  },
});

module.exports = { test, expect: base.expect };
