// @ts-check
const { test: setup, expect } = require('@playwright/test');
const { sm } = require('../utils/selectors');
const { env } = require('../utils/env');
const fs = require('node:fs');

const AUTH_FILE = '.auth/user.json';

/**
 * Login UNA sola vez -> guarda storageState reutilizable por todos los proyectos.
 * Se ejecuta como dependencia "setup" (ver playwright.config.js).
 *
 * NOTA: el formulario de login de SM2 (vista index.coffee) NO expone marcas
 * `sm:`, por eso aquí se usan roles/accessible-name en lugar de sm(). Es la
 * única excepción permitida a la regla "solo selectores sm:". Pendiente:
 * pedir al front agregar sm:login.email / sm:login.password / sm:login.submit.
 */
setup('authenticate', async ({ page }) => {
  expect(env.user, 'TEST_USER_<ENV> no definido en .env').toBeTruthy();
  expect(env.pass, 'TEST_PASS_<ENV> no definido en .env').toBeTruthy();

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(env.user);
  await page.getByRole('textbox', { name: 'Password' }).fill(env.pass);
  await page.getByRole('button', { name: 'Login' }).click();

  // Señal de sesión iniciada verificada en vivo: redirige a /dashboard y
  // renderiza el nav principal.
  await page.waitForURL('**/dashboard');
  await expect(page.locator(sm('nav-header-dashboard'))).toBeVisible();

  fs.mkdirSync('.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
