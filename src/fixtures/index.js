// @ts-check
const base = require('@playwright/test');
const { MediaPage } = require('../pages/media.page');
const { MediaDetailPage } = require('../pages/media-detail.page');
const { LiveStreamPage } = require('../pages/live-stream.page');
const { ShowPage } = require('../pages/show.page');
const { LiveEditorPage } = require('../pages/live-editor.page');
const { MediaClient } = require('../api/media.client');
const { LiveStreamClient } = require('../api/live-stream.client');
const { EditorClient, LiveEditorClient } = require('../api/live-editor.client');
const { ResourceCleaner } = require('./resource-cleaner');
const { createTranscodedMedia } = require('../api/media-factory');
const { createLiveStream } = require('../api/live-stream-factory');
const { env } = require('../utils/env');

const AUTH_FILE = '.auth/user.json';
// Video público corto y liviano para ingesta remota (transcoding rápido).
// Configurable por env; default reproducible.
const SAMPLE_VIDEO_URL =
  process.env.QA_SAMPLE_VIDEO_URL ||
  'https://cdn.pixabay.com/video/2022/10/01/133165-755982945_tiny.mp4';

/**
 * Fixtures compartidas: Page Objects, contexto API autenticado por sesión, y
 * provisioning de datos self-contained (crear + limpiar).
 * Uso en specs:  const { test, expect } = require('../../src/fixtures');
 */
const test = base.test.extend({
  // Page Object de Media (listado)
  mediaPage: async ({ page }, use) => {
    await use(new MediaPage(page));
  },

  // Page Object del detalle/edición de Media
  mediaDetailPage: async ({ page }, use) => {
    await use(new MediaDetailPage(page));
  },

  // Page Object del listado de Live Stream
  liveStreamPage: async ({ page }, use) => {
    await use(new LiveStreamPage(page));
  },

  // Page Object del módulo Show (listado + detalle)
  showPage: async ({ page }, use) => {
    await use(new ShowPage(page));
  },

  // Page Object del editor de un evento (live editor detail)
  liveEditorPage: async ({ page }, use) => {
    await use(new LiveEditorPage(page));
  },

  // APIRequestContext autenticado por SESIÓN (cookies del storageState del
  // login). Autoriza /api/media igual que la app, sin token aparte.
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: env.baseURL,
      storageState: AUTH_FILE,
      // Timeout propio del contexto API: el actionTimeout (10s) está pensado
      // para clicks de UI; un POST de escritura contra el dev compartido bajo
      // carga paralela (crear live/schedule) puede tardar más. 30s no enmascara
      // bugs (un fallo real responde con status, no timeout de red).
      timeout: 30_000,
    });
    await use(ctx);
    await ctx.dispose();
  },

  mediaClient: async ({ api }, use) => {
    await use(new MediaClient(api));
  },

  liveStreamClient: async ({ api }, use) => {
    await use(new LiveStreamClient(api));
  },

  // Contrato de clips del Live Editor (/api/editor).
  editorClient: async ({ api }, use) => {
    await use(new EditorClient(api));
  },

  // Datos del Live Editor (/api/live-editor).
  liveEditorClient: async ({ api }, use) => {
    await use(new LiveEditorClient(api));
  },

  // Live-stream REAL self-contained: lo crea por API y lo borra al terminar
  // (teardown idempotente via ResourceCleaner). El test recibe el id ya creado.
  // A diferencia de transcodedMedia, no hay gate de transcoding que esperar.
  liveStream: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api);
    const name = `[QA-AUTO] Live ${testInfo.title.slice(0, 40)} ${Date.now()}`;
    const id = await createLiveStream(api, { name, type: 'video' });
    cleaner.register('live-stream', id);
    await use(id);
    await cleaner.clean();
  },

  // Media REAL self-contained: ingesta remota + gate de transcoding; se borra
  // al terminar (teardown idempotente). El test recibe el id ya listo.
  transcodedMedia: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api);
    const fileName = `[QA-AUTO] ${testInfo.title.slice(0, 40)} ${Date.now()}`;
    const id = await createTranscodedMedia(api, { fileUrl: SAMPLE_VIDEO_URL, fileName });
    cleaner.register('media', id);
    await use(id);
    await cleaner.clean();
  },
});

module.exports = { test, expect: base.expect };
