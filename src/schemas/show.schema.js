// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del recurso Show del admin SM2.
 * Portado de api_test_flow/schemas/show.schema.js.
 *
 * DIFERENCIA importante vs los otros modulos: el handler sm2 de Show en su
 * version actual SOLO expone /api/show/list (sm2/app.js:4094). El handler hace
 * un .select() que excluye 'account', 'custom_feed_data', 'gracenote' - por eso
 * `account` es opcional aqui.
 *
 * El envelope de respuesta SI es {status, data:[...]} para /api/show/list.
 *
 * Sub-resources de Show (/season, /episode) tienen shape propio y se prueban en
 * spec separado (tests/api/integration/show-seasons.* etc.).
 */
const showSchema = z.object({
  _id: z.string(),
  title: z.string(),
  type: z.enum(['tvshow', 'radioshow', 'podcast', 'movie', 'mixed']),
  // 'account' excluido por sm2 al listar (riesgo cross-account), incluido en POST.
  account: z.string().optional(),
  is_published: z.boolean(),
  status: z.enum(['OK', 'DELETE']).optional(),
  date_created: z.string(),
  date_updated: z.string().optional(),
  genres: z.array(z.string()).optional(),
  iab_genres: z.array(z.string()).optional(),
  distributors: z.array(z.unknown()).optional(),
  producers: z.array(z.unknown()).optional(),
  featuring: z.array(z.unknown()).optional(),
  hosts: z.array(z.unknown()).optional(),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  short_title: z.string().nullable().optional(),
  rating: z.number().optional(),
  next_episode: z.number().optional(),
  free_episodes_count: z.number().optional(),
  is_vertical: z.boolean().optional(),
}).passthrough();

/**
 * Schema para items de /api/show/list.
 *
 * El handler sm2 hace un `.select()` que por defecto retorna SOLO _id/title/type
 * (MINIMUM_FIELDS en src/server/routes/api/show/list.js). Los demas campos llegan
 * solo si el query incluye `?fields=slug,description,...`.
 *
 * Esto difiere del POST/GET-by-id (que devuelve el documento completo). Tener un
 * schema dedicado evita falsos negativos cuando el handler cambia su lista default.
 */
const showListItemSchema = z.object({
  _id: z.string(),
  title: z.string().optional(),
  type: z.enum(['tvshow', 'radioshow', 'podcast', 'movie', 'mixed']).optional(),
}).passthrough();

module.exports = { showSchema, showListItemSchema };
