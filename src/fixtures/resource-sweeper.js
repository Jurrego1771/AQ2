// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { request } = require('@playwright/test');
const { env } = require('../utils/env');

/**
 * ResourceSweeper — barrido por nombre para el teardown global.
 *
 * Idea: al final del run, recorrer los listados de los tipos conocidos y
 * borrar todo lo que matchea el regex de nombre (por defecto:
 * `[QA-AUTO][run=<runId>]`). Esto cubre:
 *   - crashes / SIGKILL de workers (no llegó el per-test teardown)
 *   - bugs del ResourceCleaner (404, race con cascade)
 *   - fixtures que olvidaron `register()` (smell localizable en review)
 *
 * Es best-effort e idempotente: 404 = OK, errores no detienen el barrido.
 *
 * Uso típico (en global-teardown.js):
 *   const sweeper = new ResourceSweeper({ storageState: '.auth/user.json' });
 *   const stats = await sweeper.sweepByRunId(process.env.QA_RUN_ID);
 *   sweeper.writeReport('reports/cleanup-<runId>.json', stats);
 *   await sweeper.dispose();
 *
 * Configurable por env:
 *   QA_SWEEP_HISTORICAL=true  -> barra cualquier [QA-AUTO][run=<*>]
 *   QA_SWEEP_LIMIT=200         -> cuántos recursos lista por tipo (default 200)
 *   QA_SWEEP_TYPES=live-stream,media  -> override de los tipos a barrer
 */
const DEFAULT_TYPES = ['media', 'live-stream', 'playlist', 'ad'];
// Cuántos listar por tipo (los más recientes primero). Cubre fugas de un run
// normal; subir si se ejecutan suites grandes con >200 creates/tipo.
const DEFAULT_LIMIT = 200;
const DELETE_RETRIES = 3;
const RETRY_DELAY_MS = 500;

/** Mapeo tipo -> endpoint base + extractor de id + nombre. */
const SWEEPERS = {
  media: {
    list: (api, limit) =>
      api.get(`/api/media?admin=true&all=true&limit=${limit}&sort=-date_created&lite=true`),
    extractItems: (body) => body?.data || [],
    extractId: (it) => it?._id,
    extractName: (it) => it?.title || it?.name || '',
    delete: (api, id) => api.delete(`/api/media/${id}`),
  },
  'live-stream': {
    list: (api, limit) =>
      api.get(`/api/live-stream?all=true&limit=${limit}&sort=-date_created&lite=true`),
    extractItems: (body) => body?.data || [],
    extractId: (it) => it?._id,
    extractName: (it) => it?.name || '',
    delete: (api, id) => api.delete(`/api/live-stream/${id}`),
  },
  playlist: {
    list: (api, limit) => api.get(`/api/playlist?all=true&limit=${limit}&sort=-date_created`),
    extractItems: (body) => body?.data || [],
    extractId: (it) => it?._id,
    extractName: (it) => it?.name || it?.title || '',
    delete: (api, id) => api.delete(`/api/playlist/${id}`),
  },
  ad: {
    list: (api, limit) => api.get(`/api/ad?all=true&limit=${limit}&sort=-date_created`),
    extractItems: (body) => body?.data || [],
    extractId: (it) => it?._id,
    extractName: (it) => it?.name || '',
    delete: (api, id) => api.delete(`/api/ad/${id}`),
  },
};

class ResourceSweeper {
  /**
   * @param {object} opts
   * @param {string} [opts.storageState] Ruta al storageState del login.
   * @param {string} [opts.baseURL] Override de baseURL (default: env.baseURL).
   * @param {string[]} [opts.types] Tipos a barrer (default: DEFAULT_TYPES).
   * @param {number} [opts.limit] Cuántos listar por tipo (default: DEFAULT_LIMIT).
   */
  constructor({ storageState = '.auth/user.json', baseURL, types, limit } = {}) {
    this.storageState = storageState;
    this.baseURL = (baseURL || env.baseURL || '').replace(/\/+$/, '');
    this.types = (types && types.length ? types : null) || this._typesFromEnv();
    this.limit = limit || this._limitFromEnv();
    /** @type {import('@playwright/test').APIRequestContext|null} */
    this.ctx = null;
  }

  _typesFromEnv() {
    const raw = process.env.QA_SWEEP_TYPES;
    if (!raw) return DEFAULT_TYPES;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  _limitFromEnv() {
    const raw = process.env.QA_SWEEP_LIMIT;
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
  }

  /** Construye el APIRequestContext autenticado por storageState. */
  async init() {
    if (this.ctx) return this.ctx;
    if (!this.baseURL) throw new Error('ResourceSweeper: baseURL vacío');
    this.ctx = await request.newContext({
      baseURL: this.baseURL,
      storageState: fs.existsSync(this.storageState) ? this.storageState : undefined,
      timeout: 30_000,
    });
    return this.ctx;
  }

  async dispose() {
    if (this.ctx) {
      await this.ctx.dispose();
      this.ctx = null;
    }
  }

  /**
   * Barre un tipo. Devuelve { found, deleted, errors }.
   * @param {string} type
   * @param {RegExp} nameRegex
   */
  async _sweepType(type, nameRegex) {
    const cfg = SWEEPERS[type];
    if (!cfg) return { type, found: 0, deleted: 0, errors: [] };

    const ctx = await this.init();
    let body;
    try {
      const res = await cfg.list(ctx, this.limit);
      if (!res.ok()) {
        return {
          type,
          found: 0,
          deleted: 0,
          errors: [{ phase: 'list', status: res.status(), text: (await res.text()).slice(0, 200) }],
        };
      }
      body = await res.json();
    } catch (e) {
      return { type, found: 0, deleted: 0, errors: [{ phase: 'list', error: String(e) }] };
    }

    const items = cfg.extractItems(body);
    const matches = items.filter((it) => {
      const n = cfg.extractName(it);
      return n && nameRegex.test(n);
    });

    const errors = [];
    let deleted = 0;
    for (const item of matches) {
      const id = cfg.extractId(item);
      if (!id) continue;
      const ok = await this._deleteWithRetry(cfg.delete, id, type);
      if (ok) deleted += 1;
      else errors.push({ phase: 'delete', id, name: cfg.extractName(item) });
    }

    return { type, found: matches.length, deleted, errors };
  }

  async _deleteWithRetry(doDelete, id, type) {
    let lastStatus = 0;
    for (let attempt = 1; attempt <= DELETE_RETRIES; attempt += 1) {
      try {
        const r = await doDelete(this.ctx, id);
        const status = r.status();
        if (status >= 200 && status < 300) return true;
        if (status === 404) return true; // ya no existe
        lastStatus = status;
        if (attempt < DELETE_RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } catch (e) {
        lastStatus = -1;
        if (attempt < DELETE_RETRIES) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    return false;
  }

  /**
   * Barrido por runId (default): barre solo lo del run actual.
   * @param {string} runId 6 hex chars
   * @returns {Promise<object>} stats agregadas
   */
  async sweepByRunId(runId) {
    if (!runId || !/^[0-9a-f]{6}$/.test(runId)) {
      throw new Error(`sweepByRunId: runId inválido (esperado 6 hex): ${runId}`);
    }
    const re = new RegExp(`\\[run=${runId}\\]`);
    return this._sweep(re, { mode: 'current-run', runId });
  }

  /**
   * Barrido histórico (opt-in via QA_SWEEP_HISTORICAL): barre cualquier
   * [QA-AUTO][run=<*>] sin importar el run. NO toca nada que no sea QA.
   */
  async sweepHistorical() {
    const re = /\[QA-AUTO\]\[run=[0-9a-f]{6}\]/;
    return this._sweep(re, { mode: 'historical' });
  }

  async _sweep(nameRegex, modeMeta) {
    const startedAt = new Date().toISOString();
    const perType = [];
    let totalFound = 0;
    let totalDeleted = 0;
    const allErrors = [];

    for (const type of this.types) {
      const r = await this._sweepType(type, nameRegex);
      perType.push(r);
      totalFound += r.found;
      totalDeleted += r.deleted;
      if (r.errors?.length) allErrors.push({ type, errors: r.errors });
    }

    return {
      mode: modeMeta.mode,
      runId: modeMeta.runId || null,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseURL: this.baseURL,
      limit: this.limit,
      types: this.types,
      totalFound,
      totalDeleted,
      totalLeaked: totalFound - totalDeleted,
      perType,
      errors: allErrors,
    };
  }

  /**
   * Persiste el reporte a disco. Crea el directorio si falta.
   * @param {string} filePath
   * @param {object} stats
   */
  writeReport(filePath, stats) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
  }
}

module.exports = { ResourceSweeper, SWEEPERS, DEFAULT_TYPES };