// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del sub-recurso Season de Show (sm2 nested route
 * /api/show/:id/season[/:seasonId]).
 *
 * Portado de api_test_flow/schemas/season.schema.js.
 *
 * NOTA: la API sm2 anida el season bajo el show padre. La respuesta de
 * GET /api/show/:id/season es envelope {version, data: [...]}, pero
 * GET /api/show/:id/season/:seasonId y POST /api/show/:id/season devuelven
 * el objeto season en root (sin wrapper {status,data}). El endpoint
 * de delete es /api/show/:id/season/:seasonId (también root).
 */
const seasonSchema = z
  .object({
    _id: z.string(),
    title: z.string(),
    show: z.string(),
    order: z.number().optional(),
    description: z.string().optional().nullable(),
    first_emision: z.string().optional().nullable(),
    featuring: z.array(z.unknown()).optional(),
    hosts: z.array(z.unknown()).optional(),
    episodes: z.array(z.unknown()).optional(),
    images: z.array(z.unknown()).optional(),
    account: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();

/**
 * Envelope de lista: GET /api/show/:id/season -> {version, data: [season]}.
 * (No incluye `status` — quirk conocido de la API.)
 */
const seasonListEnvelope = z
  .object({
    version: z.string().optional(),
    data: z.array(seasonSchema),
  })
  .passthrough();

module.exports = { seasonSchema, seasonListEnvelope };