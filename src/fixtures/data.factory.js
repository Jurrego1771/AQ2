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
 * Factory de Category. NOTA: el bot QA en dev NO tiene modulo `category` habilitado
 * para POST /api/category (verificado 2026-07-08: devuelve 403 al intentar crear).
 * Por ahora este factory existe para tests futuros cuando se configuren las
 * credenciales admin (TOK-RISK-001). Mientras tanto, los specs de category son
 * todos read-only contra categorias pre-existentes en dev.
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

module.exports = { mediaItem, user, categoryFactory, faker };
