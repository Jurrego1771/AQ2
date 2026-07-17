// @ts-check
const base = require('@playwright/test');
const { MediaPage } = require('../pages/media.page');
const { MediaDetailPage } = require('../pages/media-detail.page');
const { LiveStreamPage } = require('../pages/live-stream.page');
const { LiveStreamDetailPage } = require('../pages/live-stream-detail.page');
const { ShowPage } = require('../pages/show.page');
const { LiveEditorPage } = require('../pages/live-editor.page');
const { PlaylistPage } = require('../pages/playlist.page');
const { IntegrationsPage } = require('../pages/integrations.page');
const { SchedulePage } = require('../pages/schedule.page');
const { AdsPage } = require('../pages/ads.page');
const { TokenPage } = require('../pages/token.page');
const { MoaiPage } = require('../pages/moai.page');
const { CustomerDetailPage } = require('../pages/customer-detail.page');
const { MediaClient } = require('../api/media.client');
const { LiveStreamClient } = require('../api/live-stream.client');
const { EditorClient, LiveEditorClient, DvrClient } = require('../api/live-editor.client');
const { PlaylistClient } = require('../api/playlist.client');
const { AdsClient } = require('../api/ads.client');
const { ResourceCleaner } = require('./resource-cleaner');
const { createTranscodedMedia } = require('../api/media-factory');
const { newFastChannelContext } = require('../api/fast-channel-factory');
const { createLiveStream } = require('../api/live-stream-factory');
const { createLiveSignal } = require('../api/live-signal-factory');
const { isAvailable: isFfmpegAvailable } = require('../utils/ffmpeg');
const { createAd } = require('../api/ads-factory');
const { createUser, setUserCategories } = require('../api/users-factory');
const { env } = require('../utils/env');
const { qaName } = require('../utils/qa-name');

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

  // Page Object del detalle/edicion de Live Stream (/live-stream/:id y /live-stream/new)
  liveStreamDetailPage: async ({ page }, use) => {
    await use(new LiveStreamDetailPage(page));
  },

  // Page Object del módulo Show (listado + detalle)
  showPage: async ({ page }, use) => {
    await use(new ShowPage(page));
  },

  // Page Object de la pantalla API and Tokens (/settings/api)
  tokenPage: async ({ page }, use) => {
    await use(new TokenPage(page));
  },

  // Page Object de MoAI Options (/settings/ai)
  moaiPage: async ({ page }, use) => {
    await use(new MoaiPage(page));
  },

  // Page Object del detalle de Customer (secciones Purchases/Payments)
  customerDetailPage: async ({ page }, use) => {
    await use(new CustomerDetailPage(page));
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

  // APIRequestContext autenticado por API TOKEN (header X-API-TOKEN), NO por
  // cookie de sesión. Endpoints como el CRUD de /api/show exigen el token de
  // cuenta y devuelven 401 con el storageState del login UI. Ver env.apiToken.
  apiToken: async ({ playwright }, use) => {
    if (!env.apiToken) {
      throw new Error('API_TOKEN vacío: setealo en .env (Settings > API en el dashboard).');
    }
    const ctx = await playwright.request.newContext({
      baseURL: env.baseURL,
      extraHTTPHeaders: { 'X-API-TOKEN': env.apiToken },
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
  // El testId (titulo del test) se envia al ResourceRegistry para auditoria
  // en reports/provisioning-<runId>.json (C2 de la estrategia).
  liveStream: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const name = qaName({ type: 'Live', testTitle: testInfo.title });
    const id = await createLiveStream(api, { name, type: 'video' });
    cleaner.register('live-stream', id);
    await use(id);
    await cleaner.clean();
  },

  // Live-stream de AUDIO self-contained (mismo patrón). Necesario para el bloque
  // de song metadata del schedule, que solo se renderiza en lives de audio (sm2#8463).
  audioLiveStream: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const name = qaName({ type: 'Audio Live', testTitle: testInfo.title });
    const id = await createLiveStream(api, { name, type: 'audio' });
    cleaner.register('live-stream', id);
    await use(id);
    await cleaner.clean();
  },

  // Media REAL self-contained: ingesta remota + gate de transcoding; se borra
  // al terminar (teardown idempotente). El test recibe el id ya listo.
  transcodedMedia: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const fileName = qaName({ type: 'Media', testTitle: testInfo.title });
    const id = await createTranscodedMedia(api, { fileUrl: SAMPLE_VIDEO_URL, fileName });
    cleaner.register('media', id);
    await use(id);
    await cleaner.clean();
  },

  // APIRequestContext contra el backend SEPARADO de Fast Channel (dev-api),
  // autenticado por x-api-token (= jwt del storageState). Ver fast-channel-factory.
  fastChannelCtx: async ({ playwright }, use) => {
    const ctx = await newFastChannelContext(playwright.request);
    await use(ctx);
    await ctx.dispose();
  },

  // Media de AUDIO REAL para features de IA (transcription/Deepgram): ingesta
  // remota del audio de prueba (env.sampleAudioUrl) + gate de transcoding; se
  // borra al terminar. Se salta si no hay URL configurada.
  aiAudioMedia: async ({ api }, use, testInfo) => {
    if (!env.sampleAudioUrl) throw new Error('QA_SAMPLE_AUDIO_URL no configurado en .env');
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const fileName = qaName({ type: 'Media', testTitle: testInfo.title }) + '.m4a';
    const id = await createTranscodedMedia(api, { fileUrl: env.sampleAudioUrl, fileName, genre: 'podcast' });
    cleaner.register('media', id);
    await use(id);
    await cleaner.clean();
  },

  // Ad REAL self-contained: lo crea por API y lo borra al terminar (teardown
  // idempotente via ResourceCleaner con deleter `ad`). El test recibe el id ya
  // creado. No hay gate asíncrono: el POST responde 200 con jsonp {data: ad}.
  ad: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const name = qaName({ type: 'Ad', testTitle: testInfo.title });
    const id = await createAd(api, { name, type: 'local' });
    cleaner.register('ad', id);
    await use(id);
    await cleaner.clean();
  },

  /**
   * User REAL self-contained (1 user por test): lo crea via POST /api/user
   * con email unico `[QA-AUTO]...@mediastre.am` y lo borra al terminar
   * (DELETE /api/user/:id). Resuelve CAT-RISK-6: el bot no puede actualizar
   * SU PROPIO record (500), pero SI puede crear + modificar + borrar
   * users NUEVOS. Detalles y riesgos cubiertos en src/api/users-factory.js.
   *
   * Defaults del user creado: sin permisos (todos los modulos level 0, by-
   * design: server IGNORA permissions al crear), sin 2FA, sin account_admin.
   * Para elevarlo usar `setUserPermissions` (factory).
   */
  qaUser: async ({ api }, use, testInfo) => {
    const cleaner = new ResourceCleaner(api, { testId: testInfo.title });
    const tag = qaName({ type: 'User', testTitle: testInfo.title })
      .replace(/[^a-zA-Z0-9@._-]/g, '-')
      .toLowerCase();
    const id = await createUser(api, {
      first_name: 'QA',
      last_name: 'Auto',
      email: `${tag}@mediastre.am`,
      password: `Qa!${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      can_access_uncategorized_content: true,
    });
    cleaner.register('user', id);
    await use(id);
    await cleaner.clean();
  },

  /**
   * Factory de users: en lugar de auto-crear, expone una funcion que crea
   * users bajo demanda y los borra TODOS al final del test. Pensado para
   * specs (como CAT-INH-R-001..006) que necesitan CADA test uno o mas users
   * pre-asignados a categorias distintas.
   *
   * Uso:
   *   test('...', async ({ api, qaUserFactory }) => {
   *     const userId = await qaUserFactory({ categories: [parentId] });
   *     ...
   *   });
   *
   * Devuelve el userId (string). Los users creados se trackean y se borran
   * via ResourceCleaner con deleter `user` al terminar el test, asi no
   * leakear ni contaminar la cuenta.
   */
  qaUserFactory: async ({ api }, use, testInfo) => {
    /** @type {ResourceCleaner|null} */
    let cleaner = null;
    /** @type {string[]} */
    const createdIds = [];
    await use(async (opts = {}) => {
      if (!cleaner) cleaner = new ResourceCleaner(api, { testId: testInfo.title });
      const tag = qaName({
        type: opts.tag || 'User',
        testTitle: testInfo.title,
        suffix: String(createdIds.length),
      })
        .replace(/[^a-zA-Z0-9@._-]/g, '-')
        .toLowerCase();
      const id = await createUser(api, {
        first_name: opts.first_name || 'QA',
        last_name: opts.last_name || 'Auto',
        email: `${tag}@mediastre.am`,
        password: `Qa!${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        categories: opts.categories,
        accounts: opts.accounts,
        can_access_uncategorized_content:
          opts.can_access_uncategorized_content !== false,
      });
      cleaner.register('user', id);
      createdIds.push(id);
      return id;
    });
    if (cleaner) await cleaner.clean();
  },

  /**
   * Live-signal fixture: crea un live + habilita MediaLive RTMP_PUSH + empuja
   * una senal sintetica (testsrc + sine, 720p default) via ffmpeg. Devuelve
   * un handle con:
   *   - liveId, rtmpUrl (o null si MediaLive no termino de aprovisionar),
   *     rtmpSource (medialive|legacy|null), ffmpeg proc
   *   - isOnline() / waitForOnline() / waitForRtmpUrl() para asserciones async
   *   - stop() que mata ffmpeg + apaga MediaLive + borra el live
   *
   * Tolerante: si ffmpeg no esta en PATH o el server no expone RTMP URL
   * (MediaLive sin aprovisionar / entry_points vacio), NO rompe el suite -
   * skipea el test via test.skip() con la razon. Los specs que necesiten
   * el handle "vivo" pueden verificar `handle.rtmpUrl !== null` antes de
   * asserciones que dependan del push.
   *
   * Ver src/api/live-signal-factory.js para el detalle.
   */
  liveSignal: async ({ api }, use, testInfo) => {
    test.skip(
      !(await isFfmpegAvailable()),
      'ffmpeg no esta en PATH; instalar o setear FFMPEG_PATH'
    );
    const name = qaName({ type: 'LiveSignal', testTitle: testInfo.title });
    const handle = await createLiveSignal(api, {
      name,
      durationSec: 30,
      verbose: false,
    });

    // start() lanza el push; si no hay RTMP URL en el server, loguea y
    // deja el handle con rtmpUrl=null. El spec caller puede detectar eso
    // y skipear su assercion si quiere.
    let startErr = null;
    try {
      await handle.start();
    } catch (e) {
      startErr = e;
    }

    if (!handle.rtmpUrl) {
      // Mejor opcion para el runner: skipear con la causa real visible.
      test.skip(
        true,
        `liveSignal sin RTMP URL: ${startErr?.message || 'medialive.inputs y entry_points.primary vacios'}. ` +
          `Verificar que MediaLive este habilitado en esta cuenta o que el server exponga entry_points por defecto.`
      );
    }

    try {
      await use(handle);
    } finally {
      await handle.stop();
    }
  },
});

module.exports = { test, expect: base.expect };
