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

    // ---- Ad Markers (cluster 4) — ver overview.md ----
    // Creación manual: 'create-ad-marker' abre el modal #create-marker-modal.
    this.createAdMarkerButton = page.locator(sm('create-ad-marker'))
    this.adMarkersBody = page.locator(sm('adMarkers'))
    this.adMarkerRows = page.locator(`${sm('adMarkers')} tr[track-id]`)
    this.markerTimeInput = page.locator(sm('marker-time'))
    this.createMarkerButton = page.locator(sm('create-marker-btn'))
    this.markerDurationHelp = page.locator(sm('marker-duration-help'))

    // ---- Subtitles (cluster 5) ----
    // Los campos viven dentro de modales (#upload-subtitle / #generate-subtitle),
    // cuyos triggers "Upload Subtitles"/"Auto Generate" NO exponen marca sm: y
    // están en una sección colapsable (gap de testabilidad). El modal se abre por
    // su id con el API de Bootstrap (mismo enfoque jQuery que setCategory).
    this.saveSubtitleButton = page.locator(sm('save-subtitle'))
    this.subtitleNameInput = page.locator(sm('subtitle-name'))
    this.subtitleLanguageSelect = page.locator(sm('subtitle-language'))
    // El <input type=file> de subtítulo no tiene marca sm: (gap); accept estable.
    this.subtitleFileInput = page.locator('#upload-subtitle input[type="file"]')
    this.generateSubButton = page.locator(sm('generate-sub'))
    this.subNameInput = page.locator(sm('sub-name'))
    this.subMainLanguageSelect = page.locator(sm('sub-main-language'))

    // ---- Thumbnails / Preview (cluster 3) — ver overview.md ----
    // La UI agrupa los thumbnails por timestamp: muestra un thumb representativo
    // por segundo (la marca lleva thumb-id). Los thumbs cargan async vía /thumbs.
    this.thumbs = page.locator(sm('thumb')) // anclas con thumb-id (1 por timestamp)
    this.thumbsContainer = page.locator(sm('thumbs'))
    /** @param {string} thumbId botón "Set as default" de un thumb. */
    this.selectThumbButton = (thumbId) =>
      page.locator(`${sm('select-thumb')}[thumb-id="${thumbId}"]`)
    this.deleteThumbButtons = page.locator(sm('delete-thumb'))
    // Upload de thumbnail (modal #upload-media; dropzone "Add Thumbnail"). El file
    // input acepta image/* (max 2MB) y NO tiene marca sm: (gap). El crop (Jcrop) es
    // opcional: el upload ya persiste el thumb antes de save-edited-thumbnail.
    this.thumbUploadInput = page.locator('#media-upload input[type="file"]')
    this.saveEditedThumbnail = page.locator(sm('save-edited-thumbnail'))
    // Preview: new-preview regenera desde el playhead; replace-preview sube video.
    this.replacePreviewButton = page.locator(sm('replace-preview'))
    this.saveNewPreviewButton = page.locator(sm('save-new-preview'))
  }

  // ===== Thumbnails =====

  /**
   * Ids de los thumbnails seleccionables visibles (derivados de la marca).
   * Espera a que el primer thumb cargue (async vía /thumbs).
   * @returns {Promise<string[]>}
   */
  async thumbIds() {
    await this.thumbs.first().waitFor({ state: 'visible', timeout: 15_000 })
    return this.thumbs.evaluateAll((els) =>
      els.map((el) => el.getAttribute('thumb-id')).filter(Boolean)
    )
  }

  /**
   * Marca un thumbnail como default ("Set as default"). El handler hace un POST
   * sin navegación; el test verifica el efecto por API.
   * @param {string} thumbId
   */
  async setThumbnailAsDefault(thumbId) {
    await this.selectThumbButton(thumbId).click({ timeout: 10_000 })
  }

  /**
   * Sube un archivo de imagen como thumbnail por el modal #upload-media.
   * El uploader registra el thumb (POST /thumbnail/upload) antes del crop opcional.
   * @param {string} filePath ruta absoluta a una imagen
   */
  async uploadThumbnail(filePath) {
    // Abre el modal por id (el dropzone usa data-toggle; abrir por id es estable).
    // @ts-ignore — jQuery global de la app (Bootstrap modal)
    await this.page.evaluate(() => window.jQuery('#upload-media').modal('show'))
    await this.thumbUploadInput.waitFor({ state: 'attached', timeout: 10_000 })
    await this.thumbUploadInput.setInputFiles(filePath)
  }

  // ===== Ad Markers =====

  /** Abre el modal de creación manual de ad marker y espera el input de tiempo. */
  async openCreateAdMarkerModal() {
    await this.createAdMarkerButton.click()
    await this.markerTimeInput.waitFor({ state: 'visible', timeout: 10_000 })
  }

  /**
   * Envía un tiempo en el modal manual. NO asume éxito: el tiempo puede ser
   * rechazado por validación (formato / excede duración), en cuyo caso el modal
   * permanece abierto y no se escribe en DB.
   * @param {string} timeStr formato HH:MM:SS
   */
  async submitAdMarkerTime(timeStr) {
    await this.markerTimeInput.fill(timeStr)
    await this.createMarkerButton.click()
  }

  /** @returns {Promise<boolean>} el modal de creación manual sigue abierto. */
  async isAdMarkerModalOpen() {
    return this.markerTimeInput.isVisible()
  }

  // ===== Subtitles =====

  /** Abre el modal "Upload Subtitles" por id (gap: trigger sin sm:). */
  async openUploadSubtitleModal() {
    // @ts-ignore — jQuery global de la app (Bootstrap modal)
    await this.page.evaluate(() => window.jQuery('#upload-subtitle').modal('show'))
    await this.saveSubtitleButton.waitFor({ state: 'visible', timeout: 10_000 })
  }

  /** Abre el modal "Auto Generate" (IA) por id (gap: trigger sin sm:). */
  async openGenerateSubtitleModal() {
    // @ts-ignore — jQuery global de la app (Bootstrap modal)
    await this.page.evaluate(() => window.jQuery('#generate-subtitle').modal('show'))
    await this.generateSubButton.waitFor({ state: 'visible', timeout: 10_000 })
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
