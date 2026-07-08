// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del recurso Live Stream del admin SM2.
 * Portado de api_test_flow/schemas/live.schema.js.
 *
 * Cobertura minima (Create/Get/List). Sub-resources (schedule-job, thumb, logo,
 * quizzes, EPG, restream) tienen shape propio y se prueban aparte en specs de
 * live-stream/ integration.
 *
 * NOTA: el schema requerira ampliaciion cuando AQ2 migre los spec de integracion
 * de live-stream (PR3 Fase 1) - los alli exponen campos como
 * master/slave/restream/encoder que este schema basico no contempla.
 */
const liveStreamSchema = z.object({
  _id: z.string(),
  name: z.string(),
  account: z.string(),
  online: z.boolean(),
  dvr: z.boolean(),
  recording: z.boolean(),
  closed_access: z.boolean().optional(),
  type: z.string(),
  date_created: z.string(),
  slug: z.string().optional(),
  stream_id: z.string().optional(),
  views: z.number().optional(),
  priority: z.number().optional(),
  is_adswizz: z.boolean().optional(),
  preferred_protocol: z.string().optional(),
  nowplaying: z.boolean().optional(),
  multiple_clips: z.boolean().optional(),
}).passthrough();

const okEnvelope = z.object({ status: z.literal('OK') }).passthrough();

const createLiveStreamResponseSchema = okEnvelope.extend({ data: liveStreamSchema });
const getLiveStreamResponseSchema = okEnvelope.extend({ data: liveStreamSchema });
const listLiveStreamResponseSchema = okEnvelope.extend({ data: z.array(liveStreamSchema) });

module.exports = {
  liveStreamSchema,
  createLiveStreamResponseSchema,
  getLiveStreamResponseSchema,
  listLiveStreamResponseSchema,
};
