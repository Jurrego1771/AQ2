// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del recurso Category del admin SM2.
 *
 * Verificado en vivo contra /api/category (dev v7.0.71) con cuenta botqa@mediastre.am.
 * El handler sm2 hace un .select() explicito (categorias/index.js:239) con:
 *   'name description parent date_created image_url visible track app_feed
 *    drm custom slug filter_categories'
 * Los campos que faltan en ese select no aparecen en la respuesta.
 *
 * Contexto del PR #8451 (Jurrego1771/AQ2): este endpoint se volvio accesible
 * para tokens API restringidos una vez que se anadio 'media.category' al
 * TokenProfile enum. La cobertura de AragonTV flow vive en
 * tests/api/token-profile.gate.spec.js (skip-if-no-credentials).
 */

const drmSchema = z.object({
  enabled: z.boolean().optional(),
  allow: z.boolean().optional(),
  allow_incompatible_devices: z.boolean().optional(),
}).passthrough();

const customSchema = z.record(z.string(), z.unknown()).optional();

const filterCategoriesSchema = z.array(z.string()).optional();

const categorySchema = z.object({
  _id: z.string(),
  drm: drmSchema.optional(),
  visible: z.boolean().optional(),
  track: z.boolean().optional(),
  filter_categories: filterCategoriesSchema,
  date_created: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  slug: z.string().optional(),
  custom: customSchema,
  parent: z.union([z.string(), z.null()]).optional(),
}).passthrough();

const listCategoryResponseSchema = z.object({
  status: z.literal('OK'),
  data: z.array(categorySchema),
}).passthrough();

const getCategoryResponseSchema = z.object({
  status: z.literal('OK'),
  data: categorySchema,
}).passthrough();

const unauthResponseSchema = z.object({
  status: z.literal('ERROR'),
  data: z.string(),
}).passthrough();

module.exports = {
  categorySchema,
  listCategoryResponseSchema,
  getCategoryResponseSchema,
  unauthResponseSchema,
  drmSchema,
};
