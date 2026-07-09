// @ts-check
require('dotenv').config();
const { request } = require('@playwright/test');
const { env } = require('../src/utils/env');

/**
 * Limpia [QA-AUTO] lives que quedaron en dev por fallas de teardown.
 * Uso: `node scripts/sweep-qa-leaks.js [--all]`
 *   sin args: solo [QA-AUTO][run=<QA_RUN_ID>] (si QA_RUN_ID esta seteado)
 *   --all:    cualquier [QA-AUTO][run=*] (todos los runs)
 */
(async () => {
  const includeAll = process.argv.includes('--all');
  if (!env.baseURL) {
    console.log('env.baseURL vacio; verifica .env');
    return;
  }
  const ctx = await request.newContext({
    baseURL: env.baseURL,
    storageState: '.auth/user.json',
    timeout: 30_000,
  });
  let total = 0, deleted = 0, failed = 0;
  try {
    let skip = 0;
    while (true) {
      const r = await ctx.get(`/api/live-stream?all=true&limit=200&skip=${skip}&sort=-date_created&lite=true`);
      if (!r.ok()) {
        console.log(`FAIL ${r.status()} al listar`);
        return;
      }
      const items = (await r.json()).data || [];
      if (items.length === 0) break;
      const toDelete = items.filter((m) => {
        const name = m.name || '';
        if (!name.includes('[QA-AUTO]')) return false;
        if (!includeAll && !name.includes(`[run=${process.env.QA_RUN_ID || ''}]`)) return false;
        return true;
      });
      for (const it of toDelete) {
        total += 1;
        const del = await ctx.delete(`/api/live-stream/${it._id}`);
        if (del.ok() || del.status() === 404) {
          deleted += 1;
          console.log(`OK   ${it._id}  ${it.name}`);
        } else {
          failed += 1;
          console.log(`FAIL ${del.status()} ${it._id}  ${it.name}`);
        }
      }
      if (items.length < 200) break;
      skip += 200;
    }
  } finally {
    await ctx.dispose();
  }
  console.log(`\nTotal: ${total}  Deleted: ${deleted}  Failed: ${failed}`);
})();
