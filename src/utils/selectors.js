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

/**
 * Selector de atributo semántico `[data-name="..."]`.
 *
 * `data-name` es un atributo que la PROPIA app usa para serializar el form
 * (verificado en vivo: el body del POST /api/playlist sale de estos data-name).
 * NO es un selector frágil como texto/CSS/XPath: si el front lo renombra, la
 * feature se rompe, así que es un contrato estable de facto. Se admite como
 * fallback cuando el elemento aún no tiene marca `sm:` (deuda de testabilidad).
 *
 * @param {string} name - valor del data-name, p.ej. "playlist-uses-reels"
 * @returns {string} selector CSS, p.ej. `[data-name="playlist-uses-reels"]`
 */
function dataName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error(`dataName() requiere un nombre string no vacío, recibido: ${JSON.stringify(name)}`);
  }
  return `[data-name="${name}"]`;
}

/**
 * Selector ESTABLE con escalera de prioridad: prefiere la marca `sm:` y cae al
 * atributo semántico `data-name` si aún no existe. El mismo test funciona hoy
 * contra `data-name` y seguirá funcionando el día que el front agregue `sm=`,
 * sin reescribir nada.
 *
 * Política del proyecto (ver CLAUDE.md): en los Page Objects se admite la
 * escalera sm: -> data-name -> role/label; SIGUE prohibido texto, clase CSS o
 * XPath posicional (eso sí es frágil).
 *
 * @param {string} name - la marca, buscada tanto en sm como en data-name
 * @returns {string} lista de selectores CSS `[sm="name"], [data-name="name"]`
 */
function stable(name) {
  if (!name || typeof name !== 'string') {
    throw new Error(`stable() requiere un nombre string no vacío, recibido: ${JSON.stringify(name)}`);
  }
  return `[sm="${name}"], [data-name="${name}"]`;
}

module.exports = { sm, smPrefix, dataName, stable };
