// Verifico si el POST directo crea el media con is_published=false y la UI lo filtra.
// Hipotesis: la card no aparece porque el media queda no-publicado por default.
const { chromium } = require('@playwright/test');
const { mediaItem } = require('../src/fixtures/data.factory');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: 'https://dev.platform.mediastre.am', storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  const req = ctx.request;

  const payload = mediaItem({ title: '[QA-PROBE-CHECK] ' + Date.now(), description: 'check published' });
  const postRes = await req.post('/api/media', { data: payload });
  const postBody = await postRes.json();
  const id = postBody.data?._id || postBody.id;
  console.log(`id=${id}`);
  console.log(`is_published from POST: ${postBody.data?.is_published}`);
  console.log(`title from POST:       ${postBody.data?.title}`);

  // GET directo del media por id
  const directGet = await req.get('/api/media/' + id);
  const directBody = await directGet.json();
  console.log(`GET /api/media/<id> is_published: ${directBody.data?.is_published}`);
  console.log(`GET /api/media/<id> status:        ${directBody.data?.status}`);

  // Buscar en el listado por titulo via API (3 formas)
  for (const q of ['', payload.title.slice(0, 20), '[QA-PROBE-CHECK]']) {
    const r = await req.get('/api/media?admin=true&all=true&limit=12&query=' + encodeURIComponent(q));
    const b = await r.json();
    const found = (b.data || []).find(m => m._id === id);
    console.log(`query='${q}' resultados=${(b.data || []).length} found=${!!found}`);
  }

  // Buscar en el listado por titulo via API SIN all=true (lo que ve la UI por default?)
  const defaultGet = await req.get('/api/media?limit=12&query=' + encodeURIComponent(payload.title.slice(0, 20)));
  const def = await defaultGet.json();
  const foundDef = (def.data || []).find(m => m._id === id);
  console.log(`SIN all=true, query titulo: resultados=${(def.data || []).length} found=${!!foundDef}`);

  // Ahora la UI: ir a /media y buscar
  await page.goto('/media');
  await page.waitForSelector('[sm="query-title"]', { state: 'visible' });
  await page.locator('[sm="query-title"]').fill(payload.title.slice(0, 20));
  await page.locator('[sm="query-title"]').press('Enter');
  await page.waitForTimeout(5000);
  const cards = await page.locator('[sm^="media-container-"]:visible').count();
  const totalCountText = await page.locator('[sm="total-medias"]').first().textContent();
  console.log(`UI: search '${payload.title.slice(0,20)}' -> cards visibles=${cards}, total-medias='${totalCountText?.trim()}'`);
  await page.locator('[sm="query-title"]').fill('');
  await page.locator('[sm="query-title"]').press('Enter');
  await page.waitForTimeout(5000);
  const cardsAll = await page.locator('[sm^="media-container-"]:visible').count();
  const totalAll = await page.locator('[sm="total-medias"]').first().textContent();
  console.log(`UI: search '' (todos) -> cards visibles=${cardsAll}, total-medias='${totalAll?.trim()}'`);

  // Cleanup
  await req.delete('/api/media/' + id);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
