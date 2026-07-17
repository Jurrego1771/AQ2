// @ts-check
const { faker } = require('@faker-js/faker');

/**
 * Data factory — genera payloads de prueba con faker.
 * Cada factory acepta overrides para fijar campos en casos específicos.
 */

/** @param {Partial<Record<string, any>>} [overrides] */
function mediaItem(overrides = {}) {
  return {
    title: faker.commerce.productName(),
    description: faker.lorem.sentence(),
    type: faker.helpers.arrayElement(['image', 'video', 'audio']),
    tags: faker.helpers.arrayElements(['promo', 'hero', 'thumb', 'archive'], 2),
    ...overrides,
  };
}

/** @param {Partial<Record<string, any>>} [overrides] */
function user(overrides = {}) {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    password: faker.internet.password({ length: 14 }),
    ...overrides,
  };
}

/**
 * Factory de Category. Habilitado en dev para el bot QA desde 2026-07-14
 * (la nota previa "403 POST /api/category" de 2026-07-08 quedo desactualizada).
 * Usado por los specs CRUD en tests/api/smoke/category/category-crud.smoke.spec.js.
 */
/** @param {Partial<Record<string, any>>} [overrides] */
function categoryFactory(overrides = {}) {
  return {
    name: `[QA-AUTO] Cat-${faker.string.alphanumeric(6)}`,
    description: faker.lorem.sentence(),
    visible: true,
    track: false,
    app_feed: false,
    drm: { enabled: false, allow: false, allow_incompatible_devices: false },
    filter_categories: [],
    ...overrides,
  };
}

/**
 * Show payload — base completa con type aleatorio + genre aleatorio.
 * Pensado para specs de API (POST /api/show).
 */
/** @param {Partial<Record<string, any>>} [overrides] */
function showPayload(overrides = {}) {
  const validTypes = ['tvshow', 'radioshow', 'podcast', 'mixed'];
  const validGenres = [
    'action', 'adventure', 'animation', 'comedy', 'drama', 'documentary',
    'education', 'fantasy', 'music', 'news', 'sports & recreation', 'talk show',
    'technology', 'thriller', 'tv & film',
  ];
  return {
    title: `[QA-AUTO] Show-${faker.string.alphanumeric(6)}`,
    description: faker.lorem.paragraph(),
    type: faker.helpers.arrayElement(validTypes),
    genres: [faker.helpers.arrayElement(validGenres)],
    is_published: false,
    first_emision: faker.date.past().toISOString(),
    ...overrides,
  };
}

/** Show mínimo: solo `title` + `type` (campos required). */
/** @param {Partial<Record<string, any>>} [overrides] */
function showMinimalPayload(overrides = {}) {
  return {
    title: `[QA-AUTO] Show-Min-${faker.string.alphanumeric(6)}`,
    type: 'tvshow',
    ...overrides,
  };
}

/** Show completo: type fijo + genres + is_published + descripción larga. */
/** @param {Partial<Record<string, any>>} [overrides] */
function showFullPayload(overrides = {}) {
  return {
    title: `[QA-AUTO] Show-Full-${faker.string.alphanumeric(6)}`,
    description: faker.lorem.paragraphs(2),
    type: 'podcast',
    genres: ['music', 'education'],
    is_published: true,
    first_emision: faker.date.past().toISOString(),
    rating: 7,
    ...overrides,
  };
}

module.exports = {
  mediaItem,
  user,
  categoryFactory,
  showPayload,
  showMinimalPayload,
  showFullPayload,
  faker,
};
