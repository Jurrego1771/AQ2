// @ts-check
const { sm } = require('../utils/selectors');

/**
 * Page Object del detalle/edición de Media (ruta /media/:id, vista media.coffee).
 *
 * EXCEPCIÓN documentada a la regla "solo sm:": los campos editables de Basic
 * Information NO exponen marcas sm: (usan data-name) — ver issue #13. Hasta que
 * el front agregue sm:, se usan `[data-name="..."]` (atributo de binding del
 * form, estable). Los botones de acción SÍ usan sm: (save/delete/...).
 */
class MediaDetailPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;

    // Campos editables (data-name, excepción #13).
    this.titleInput = page.locator('input[data-name="title"]')
    this.descriptionInput = page.locator('textarea[data-name="description"]')
    this.categoriesSelect = page.locator('select[data-name="categories"]')

    // Acciones (sm: real).
    this.saveButton = page.locator(sm('save'))
    this.deleteButton = page.locator(sm('delete'))
    this.globalAlert = page.locator(sm('global-alert'))
  }

  /** @param {string} id */
  async goto(id) {
    await this.page.goto(`/media/${id}`)
    await this.titleInput.waitFor({ state: 'visible', timeout: 15_000 })
    // El form se puebla con un GET async; si se edita antes, ese GET sobrescribe
    // el cambio. El título se rellena con el nombre del media (no vacío) en ese
    // mismo GET: esperar a que tenga valor garantiza que la hidratación ya pasó.
    await this.page
      .waitForFunction(
        () => {
          const el = document.querySelector('input[data-name="title"]')
          return !!el && el.value.trim().length > 0
        },
        undefined,
        { timeout: 15_000 }
      )
      .catch(() => {})
  }

  /** @param {string} text */
  async setDescription(text) {
    await this.descriptionInput.fill(text)
  }

  /**
   * Selecciona una categoría por id usando el widget Chosen real (la app la
   * exige cuando force_category_fill está activo). Requiere jQuery+Chosen.
   * @param {string} categoryId
   */
  async setCategory(categoryId) {
    await this.page.evaluate((id) => {
      // @ts-ignore — jQuery global de la app
      const $ = window.jQuery
      const sel = $('select[data-name="categories"]')
      sel.val([id]).trigger('change').trigger('chosen:updated')
    }, categoryId)
  }

  /**
   * Pulsa Save y ESPERA la respuesta del POST (evita la carrera de recargar
   * antes de que el guardado async complete).
   * @returns {Promise<import('@playwright/test').Response>}
   */
  async save() {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => /\/api\/media\//.test(r.url()) && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      this.saveButton.click(),
    ])
    return response
  }

  /** @returns {Promise<string>} texto visible del global-alert (vacío si oculto). */
  async alertText() {
    if (!(await this.globalAlert.isVisible())) return ''
    return (await this.globalAlert.innerText()).replace(/^×/, '').trim()
  }
}

module.exports = { MediaDetailPage }
