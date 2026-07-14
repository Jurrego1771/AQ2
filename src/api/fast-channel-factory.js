// @ts-check
'use strict';

/**
 * Helpers para el backend SEPARADO de Fast Channel (micro-frontend advanced):
 * `dev-api.platform.mediastre.am/fast-channel/...` (NO el /api/ del admin).
 *
 * Auth: header `x-api-token: <JWT>`, donde el JWT es el token de sesión de la
 * cuenta — disponible en la cookie `jwt` del storageState del login. Ver
 * knowledge-core/modules/fast-channel/overview.md.
 *
 * Contrato verificado en vivo 2026-07-14 (paths capturados de la red real):
 *   POST   /fast-channel                      (crea; requiere name+adBreakMedia+bumperMedia)
 *   GET    /fast-channel/advanced             (list)
 *   GET    /fast-channel/advanced/:id         (detalle; incluye liveId, channelId)
 *   DELETE /fast-channel/:id                  (borra fc + live vinculado en cascada)
 *   GET    /fast-channel/content/media?type=video   (VODs para adBreak/bumper)
 */

const fs = require('node:fs');
const { env } = require('../utils/env');

const AUTH_FILE = '.auth/user.json';

/** Lee el JWT de sesión (cookie `jwt`) del storageState. */
function getSessionJwt(authFile = AUTH_FILE) {
  const ss = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const jwt = (ss.cookies || []).find((c) => c.name === 'jwt');
  if (!jwt?.value) throw new Error('No hay cookie `jwt` en el storageState (login primero)');
  return jwt.value;
}

/**
 * Crea un APIRequestContext apuntando al backend de Fast Channel, autenticado
 * por x-api-token.
 * @param {import('@playwright/test').APIRequest} playwrightRequest
 */
async function newFastChannelContext(playwrightRequest) {
  return playwrightRequest.newContext({
    baseURL: env.fastChannelApiUrl,
    extraHTTPHeaders: { 'x-api-token': getSessionJwt() },
    timeout: 60_000,
  });
}

/** Devuelve el _id de un media video cualquiera (para adBreak/bumper). */
async function getSampleMediaId(fcCtx) {
  const res = await fcCtx.get('/fast-channel/content/media?type=video&limit=1');
  const data = (await res.json()).data || [];
  const id = data[0]?._id || data[0]?.id;
  if (!id) throw new Error('no hay media video para usar como adBreak/bumper');
  return id;
}

/**
 * Crea un fast channel. El POST no devuelve el objeto creado, así que lo
 * resolvemos listando por nombre. Devuelve el detalle (con `liveId`).
 * @returns {Promise<{_id:string, name:string, liveId:string, channelId?:string}>}
 */
async function createFastChannel(fcCtx, { name, timezone = 'America/Santiago', adBreakMedia, bumperMedia }) {
  const media = adBreakMedia || (await getSampleMediaId(fcCtx));
  const res = await fcCtx.post('/fast-channel', {
    data: { name, timezone, adBreakMedia: media, bumperMedia: bumperMedia || media },
  });
  if (!res.ok()) {
    throw new Error(`createFastChannel: ${res.status()} ${await res.text()}`);
  }
  // Resolver el creado por nombre (el POST devuelve un ack de Mongo, no el doc).
  const list = (await (await fcCtx.get('/fast-channel/advanced')).json()).data || [];
  const found = list.find((c) => c.name === name);
  if (!found) throw new Error(`fast channel "${name}" no apareció tras crear`);
  return found;
}

/** Borra un fast channel (y su live vinculado, en cascada). */
async function deleteFastChannel(fcCtx, id) {
  return fcCtx.delete(`/fast-channel/${id}`);
}

/** Detalle de un fast channel (incluye liveId). */
async function getFastChannel(fcCtx, id) {
  return (await (await fcCtx.get(`/fast-channel/advanced/${id}`)).json()).data;
}

/**
 * Edita opciones de un fast channel ya creado. Devuelve la respuesta cruda.
 * Endpoint: POST /fast-channel/:id (PUT/PATCH dan 403).
 */
async function updateFastChannel(fcCtx, id, patch) {
  return fcCtx.post(`/fast-channel/${id}`, { data: patch });
}

/**
 * Agrega un bloque de programación al schedule (draft) del fast channel.
 * Endpoint: POST /fast-channel/advanced/:id/schedule. Requiere name + items.
 * @param {{name:string, startTime?:string, items:Array<{media:string,duration:number}>}} block
 */
async function addScheduleBlock(fcCtx, id, block) {
  return fcCtx.post(`/fast-channel/advanced/${id}/schedule`, { data: block });
}

/** Programación (schedule) actual del fast channel. */
async function getSchedule(fcCtx, id) {
  return (await (await fcCtx.get(`/fast-channel/advanced/${id}/schedule`)).json()).data || [];
}

module.exports = {
  getSessionJwt,
  newFastChannelContext,
  getSampleMediaId,
  createFastChannel,
  deleteFastChannel,
  getFastChannel,
  updateFastChannel,
  addScheduleBlock,
  getSchedule,
};
