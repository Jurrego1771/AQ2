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

module.exports = { mediaItem, user, faker };
