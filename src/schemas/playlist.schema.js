// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del recurso Playlist del admin SM2.
 * Portado de api_test_flow/schemas/playlist.schema.js. Adaptado a AQ2:
 *  - Envelope jsonp {status:'OK', data: ...} en Create/Get/List.
 *  - Sin ACCOUNT_ID hardcodeado en payloads (lo setea server desde la sesion).
 *  - Renombrado: la validacion del envelope de /api/playlist/:id/access-tokens
 *    pasa a un schema aparte para conservar foco: el spec cubre los 3 endpoints
 *    principales de Playlist y deja access-tokens fuera de scope.
 */
const accessTokenSchema = z.object({
  name: z.string(),
  token: z.string(),
}).passthrough();

const mediaItemSchema = z.object({
  _id: z.string(),
  title: z.string().optional(),
  slug: z.string().optional(),
  duration: z.number().optional(),
}).passthrough();

const playlistSchema = z.object({
  _id: z.string(),
  name: z.string(),
  type: z.enum(['manual', 'smart', 'series', 'playout']),
  account: z.string(),
  date_created: z.string(),
  no_ad: z.boolean(),
  access_restrictions: z.object({
    enabled: z.boolean(),
    rule: z.string().nullable().optional(),
  }),
  access_rules: z.object({
    closed_access: z.object({ enabled: z.boolean(), allow: z.boolean() }).optional(),
    geo: z.object({
      enabled: z.boolean(), allow: z.boolean(),
      countries: z.array(z.string()).optional(),
    }).optional(),
    cellular: z.object({ enabled: z.boolean(), allow: z.boolean() }).optional(),
    devices: z.object({
      deny_mobile: z.boolean(),
      deny_desktop: z.boolean().optional(),
      deny_tv: z.boolean(),
    }).optional(),
    referer: z.object({
      enabled: z.boolean(), allow: z.boolean(),
      referers: z.array(z.string()).optional(),
    }).optional(),
    ip: z.object({
      enabled: z.boolean(), allow: z.boolean(),
      ips: z.array(z.string()).optional(),
    }).optional(),
  }),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  medias: z.array(z.string()).optional(),
  access_tokens: z.array(accessTokenSchema).optional(),
}).passthrough();

const okEnvelope = z.object({ status: z.literal('OK') }).passthrough();

const createPlaylistResponseSchema = okEnvelope.extend({ data: playlistSchema });
const getPlaylistResponseSchema = okEnvelope.extend({ data: playlistSchema });
const listPlaylistResponseSchema = okEnvelope.extend({ data: z.array(playlistSchema) });
const mediaListResponseSchema = okEnvelope.extend({ data: z.array(mediaItemSchema) });

module.exports = {
  playlistSchema,
  createPlaylistResponseSchema,
  getPlaylistResponseSchema,
  listPlaylistResponseSchema,
  mediaListResponseSchema,
  accessTokenSchema,
};
