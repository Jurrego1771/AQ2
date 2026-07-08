// Probe de solo LECTURA (sin tocar el repo). Mide el time-to-visible de una card
// en el listado /media despues de buscar el titulo recien creado por POST /api/media.
//   - Crea un media por API directo (sin transcoding).
//   - Navega a /media, tipea el titulo en sm="query-title", Enter.
//   - Polls sobre `media-container-<id>` (selector por prefijo, ya cosechado).
// Reporta: T_post, T_search_input, T_card_first_visible, delta total.
const { chromium } = require('@playwright/test');
const { mediaItem } = require('../src/fixtures/data.factory');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: 'https://dev.platform.mediastre.am', storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  const req = ctx.request;

  const T0 = Date.now();
  const payload = mediaItem({ title: '[QA-PROBE-UI] ' + Date.now(), description: 'probe' });
  const postRes = await req.post('/api/media', { data: payload });
  const T_POST = Date.now() - T0;
  if (!postRes.ok()) {
    console.log('POST fail', postRes.status(), await postRes.text());
    process.exit(1);
  }
  const postBody = await postRes.json();
  const id = postBody.data?._id || postBody.id;
  console.log(`POST ok: id=${id} T_POST=${T_POST}ms`);

  const T_GOTO_START = Date.now();
  await page.goto('/media');
  await page.waitForSelector('[sm="query-title"]', { state: 'visible' });
  const T_GOTO = Date.now() - T_GOTO_START;
  console.log(`GOTO /media + toolbar visible: T_GOTO=${T_GOTO}ms`);

  const T_SEARCH_START = Date.now();
  await page.locator('[sm="query-title"]').fill(payload.title.slice(0, 30));
  await page.locator('[sm="query-title"]').press('Enter');
  const T_FILL_ENTER = Date.now() - T_SEARCH_START;
  console.log(`fill + Enter: T_FILL_ENTER=${T_FILL_ENTER}ms`);

  // Polling: esperamos que aparezca la card con sm="media-container-<id>"
  // o al menos una card que contenga el titulo.
  const cardSel = `[sm^="media-container-"]:visible`;
  let T_CARD_VISIBLE = null;
  const POLL_TIMEOUT = 30_000;
  const POLL_START = Date.now();
  try {
    await page.waitForSelector(cardSel, { state: 'visible', timeout: POLL_TIMEOUT });
    // Si encontro card, buscar la que tiene el titulo
    const cards = page.locator(cardSel);
    const count = await cards.count();
    let foundMatch = false;
    for (let i = 0; i < count; i++) {
      const txt = await cards.nth(i).innerText();
      if (txt.toLowerCase().includes(payload.title.toLowerCase().slice(0, 25))) {
        foundMatch = true;
        T_CARD_VISIBLE = Date.now() - POLL_START;
        break;
      }
    }
    if (!foundMatch) {
      // La card existe pero no matchea -> ver cuanto tarda en aparecer la que SI matchea
      console.log(`card visible generica a T=${Date.now()-POLL_START}ms pero titulo aun no matchea`);
    }
  } catch (e) {
    console.log('TIMEOUT sin card visible tras ' + POLL_TIMEOUT + 'ms');
  }

  if (T_CARD_VISIBLE !== null) {
    console.log(`CARD MATCH visible: T_CARD_VISIBLE=${T_CARD_VISIBLE}ms`);
    console.log(`TOTAL (POST -> card visible con match): ${T_POST + T_GOTO + T_FILL_ENTER + T_CARD_VISIBLE}ms`);
  } else {
    console.log('CARD MATCH NUNCA aparecio dentro de ' + POLL_TIMEOUT + 'ms');
  }

  // Cleanup
  await req.delete('/api/media/' + id);

  await browser.close();
})().catch((e) => { console.error('probe error', e); process.exit(1); });
