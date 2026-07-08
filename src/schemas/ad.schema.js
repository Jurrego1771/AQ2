// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del recurso Ad del admin SM2.
 * Portado de api_test_flow/schemas/ad.schema.js.
 *
 * DIFERENCIAS con el original:
 *  - El catalogo de tipos backend acepta 8 ('vast|vmap|googleima|local|
 *    ad-insertion|adswizz|ad-insertion-google|ad-prebid' - verificado leyendo
 *    src/server/routes/api/ad/create.js de sm2). El old repo solo enumero 6.
 *    Anadimos los 2 faltantes para forward-compat.
 *  - createAdResponseSchema en el old repo aceptaba `data: union(adSchema, array)`.
 *    En la practica el POST devuelve un solo ad (objeto), no un array. Lo simplificamos.
 *
 * Cobertura minima: POST/GET/list del recurso Ad. Ademas se valida el shape del
 * payload antes de hacer round-trip (smoke).
 */
const adTypeEnum = z.enum([
  'vast',
  'vmap',
  'googleima',
  'local',
  'ad-insertion',
  'ad-insertion-google',
  'adswizz',
  'ad-prebid',
]);

const adScheduleSchema = z.object({
  enabled: z.boolean().optional(),
  days: z.array(z.number()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}).passthrough();

const adAdswizzSchema = z.object({
  enabled: z.boolean().optional(),
  zone_id: z.string().optional(),
  base_url: z.string().optional(),
}).passthrough();

const adInsertionSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().optional(),
}).passthrough();

const adSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: adTypeEnum,
  is_enabled: z.boolean().optional(),
  preroll_skip_at: z.number().optional(),
  min_media_time_length: z.number().optional(),
  schedule: adScheduleSchema.optional(),
  adswizz: adAdswizzSchema.optional(),
  insertion: z.union([adInsertionSchema, z.null()]).optional(),
  categories: z.union([z.array(z.unknown()), z.null()]).optional(),
  tags: z.union([z.array(z.string()), z.null()]).optional(),
  referers: z.union([z.array(z.unknown()), z.null()]).optional(),
  date_created: z.string().optional(),
  account: z.string().optional(),
}).passthrough();

const okEnvelope = z.object({ status: z.literal('OK') }).passthrough();

const createAdResponseSchema = okEnvelope.extend({ data: adSchema });
const getAdResponseSchema = okEnvelope.extend({ data: adSchema });
const listAdResponseSchema = okEnvelope.extend({ data: z.array(adSchema) });

module.exports = {
  adTypeEnum,
  adSchema,
  createAdResponseSchema,
  getAdResponseSchema,
  listAdResponseSchema,
};
