// @ts-check
const { test, expect } = require('../../../src/fixtures')

/**
 * Regresión — Detalle de Media: Subtitles / Tracks (@regression @media).
 * Comportamiento validado en vivo contra dev.platform.mediastre.am.
 *
 * Read-only (firstMediaId, como MED-TC-012): se valida el gate de validación de
 * los formularios (sin subir archivos ni generar IA, que son flujos async caros).
 * Los modales se abren por id (sus triggers no exponen marca sm:, gap conocido).
 */
test.describe('Media detail — Subtitles @regression @media', () => {
  test('el upload de subtítulo exige idioma+nombre+archivo y restringe formatos @MED-TC-019', async ({
    mediaPage,
    mediaDetailPage,
  }) => {
    await mediaPage.goto()
    const id = await mediaPage.firstMediaId()
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy()
    await mediaDetailPage.goto(String(id))

    await mediaDetailPage.openUploadSubtitleModal()

    // Form vacío -> Save deshabilitado (gate de validación: idioma + nombre + archivo).
    await expect(mediaDetailPage.saveSubtitleButton).toBeDisabled()
    // El input de archivo restringe a los formatos soportados.
    await expect(mediaDetailPage.subtitleFileInput).toHaveAttribute('accept', '.vtt,.ass,.srt')
  })

  test('la generación IA exige nombre + idioma principal @MED-TC-020', async ({
    mediaPage,
    mediaDetailPage,
  }) => {
    await mediaPage.goto()
    const id = await mediaPage.firstMediaId()
    expect(id, 'no se pudo derivar un media del listado').toBeTruthy()
    await mediaDetailPage.goto(String(id))

    await mediaDetailPage.openGenerateSubtitleModal()

    // Al abrir, el nombre arranca vacío -> Generate deshabilitado (nombre requerido).
    await expect(mediaDetailPage.subNameInput).toHaveValue('')
    await expect(mediaDetailPage.generateSubButton).toBeDisabled()
  })
})
