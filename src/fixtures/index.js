// @ts-check
const base = require('@playwright/test');
const { MediaPage } = require('../pages/media.page');
const { MediaDetailPage } = require('../pages/media-detail.page');
const { LiveStreamPage } = require('../pages/live-stream.page');
const { ShowPage } = require('../pages/show.page');
const { LiveEditorPage } = require('../pages/live-editor.page');
const { PlaylistPage } = require('../pages/playlist.page');
const { IntegrationsPage } = require('../pages/integrations.page');
const { SchedulePage } = require('../pages/schedule.page');
const { AdsPage } = require('../pages/ads.page');
const { MediaClient } = require('../api/media.client');
const { LiveStreamClient } = require('../api/live-stream.client');
const { EditorClient, LiveEditorClient, DvrClient } = require('../api/live-editor.client');
const { PlaylistClient } = require('../api/playlist.client');
const { AdsClient } = require('../api/ads.client');
const { ResourceCleaner } = require('./resource-cleaner');
const { createTranscodedMedia } = require('../api/media-factory');
const { createLiveStream } = require('../api/live-stream-factory');
const { createAd } = require('../api/ads-factory');
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

  // Page Object del form de playlist + panel de playlists en /media
  playlistPage: async ({ page }, use) => {
    await use(new PlaylistPage(page));
  },

  // Page Object de Settings > Integrations (foco Stripe, PR sm2#8481)
  integrationsPage: async ({ page }, use) => {
    await use(new IntegrationsPage(page));
  },

  // Page Object del form de Schedule de un live (foco song metadata, PR sm2#8463)
  schedulePage: async ({ page }, use) => {
    await use(new SchedulePage(page));
  },

  // Page Object del modulo Ads (listado y form new/detail).
  adsPage: async ({ page }, use) => {
    await use(new AdsPage(page));
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

  // Creación de media desde el DVR (/api/dvr/:id).
  dvrClient: async ({ api }, use) => {
    await use(new DvrClient(api));
  },

  // Contrato de playlists (/api/playlist).
  playlistClient: async ({ api }, use) => {
    await use(new PlaylistClient(api));
  },

  // Contrato de Ads (/api/ad).
  adsClient: async ({ api }, use) => {
    await use(new AdsClient(api));
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

  // Live-stream de AUDIO self-contained (mismo patrón). Necesario para el bloque
  // de song metadata del schedule, que solo se renderiza en lives de audio (sm2#8463).
  audioLiveStream: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api);
    const name = `[QA-AUTO] Audio Live ${testInfo.title.slice(0, 40)} ${Date.now()}`;
    const id = await createLiveStream(api, { name, type: 'audio' });
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

  // Ad REAL self-contained: lo crea por API y lo borra al terminar (teardown
  // idempotente via ResourceCleaner con deleter `ad`). El test recibe el id ya
  // creado. No hay gate asíncrono: el POST responde 200 con jsonp {data: ad}.
  ad: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api);
    const name = `[QA-AUTO] Ad ${testInfo.title.slice(0, 40)} ${Date.now()}`;
    const id = await createAd(api, { name, type: 'local' });
    cleaner.register('ad', id);
    await use(id);
    await cleaner.clean();
  },
});

module.exports = { test, expect: base.expect };
