// @ts-check
const { test, expect } = require('../../../src/fixtures');

test.describe('Show @smoke', () => {
  test('el módulo Show carga para un usuario autenticado @SHW-TC-001', async ({ showPage }) => {
    await showPage.goto();
    await expect(showPage.items.first()).toBeVisible();
    expect(await showPage.count()).toBeGreaterThan(0);
    await expect(showPage.totalCount.first()).toBeVisible();
  });
});
