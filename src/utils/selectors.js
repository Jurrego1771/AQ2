// @ts-check

/**
 * Construye un selector de atributo estable `[sm="..."]`.
 *
 * REGLA DEL PROYECTO: los Page Objects NO deben usar selectores frágiles
 * (texto, clases CSS, XPath posicional). Toda interacción pasa por marcas
 * `[sm="..."]` que el equipo de front controla explícitamente para QA.
 *
 * @param {string} name - valor de la marca, p.ej. "login.submit"
 * @returns {string} selector CSS, p.ej. `[sm="login.submit"]`
 */
function sm(name) {
  if (!name || typeof name !== 'string') {
    throw new Error(`sm() requiere un nombre de marca string no vacío, recibido: ${JSON.stringify(name)}`);
  }
  return `[sm="${name}"]`;
}

/**
 * Selector por prefijo de marca `[sm^="..."]`. Para colecciones cuyas marcas
 * incluyen el id del documento (p.ej. media-container-<id>, media-title-<id>).
 *
 * @param {string} prefix - p.ej. "media-container-"
 * @returns {string} selector CSS, p.ej. `[sm^="media-container-"]`
 */
function smPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error(`smPrefix() requiere un prefijo string no vacío, recibido: ${JSON.stringify(prefix)}`);
  }
  return `[sm^="${prefix}"]`;
}

module.exports = { sm, smPrefix };
