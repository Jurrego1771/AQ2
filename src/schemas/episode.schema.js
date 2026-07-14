// @ts-check
const { z } = require('zod');

/**
 * Schema Zod del sub-recurso Episode de Show (sm2 nested route
 * /api/show/:id/season/:seasonId/episode[/:episodeId]).
 *
 * Portado de api_test_flow/schemas/episode.schema.js.
 *
 * NOTA: la API sm2 anida el episode bajo show > season.
 * - POST/GET-by-id: episode en root (sin wrapper {status,data}).
 * - GET list: {version, data: [...]} (sin campo `status` — quirk conocido).
 * - not_found devuelve 500 "2 UNKNOWN: NOT_FOUND" (bug, debería ser 404).
 * - Validation errors: 400 con `{version, data: "Mising required body fields: ..."}`
 *   (typo en la API: "Mising" en lugar de "Missing").
 */
const episodeContentSchema = z
  .object({
    _id: z.string().optional(),
    content_type: z.string(),
    type: z.string().optional(),
    value: z.union([z.string(), z.object({}).passthrough()]),
  })
  .passthrough();

const episodeSchema = z
  .object({
    _id: z.string(),
    title: z.string(),
    show: z.string().optional(),
    season: z.string().optional(),
    order: z.number().optional(),
    description: z.string().optional().nullable(),
    first_emision: z.string().optional().nullable(),
    content: z.array(episodeContentSchema).optional(),
    featuring: z.array(z.unknown()).optional(),
    hosts: z.array(z.unknown()).optional(),
    images: z.array(z.unknown()).optional(),
    account: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();

/** Envelope de lista: GET /api/show/:id/season/:seasonId/episode -> {version, data: [...]}. */
const episodeListEnvelope = z
  .object({
    version: z.string().optional(),
    data: z.array(episodeSchema),
  })
  .passthrough();

module.exports = { episodeSchema, episodeContentSchema, episodeListEnvelope };