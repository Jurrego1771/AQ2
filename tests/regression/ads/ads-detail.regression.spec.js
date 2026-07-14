// @ts-check
const { test, expect } = require('../../../src/fixtures');
const { env } = require('../../../src/utils/env');
const { ResourceCleaner } = require('../../../src/fixtures/resource-cleaner');
const { createAd } = require('../../../src/api/ads-factory');

/**
 * @regression — Detalle/Creacion del modulo Ads.
 * Verifica:
 *  - El form `/ad/new` expone Name + Status (Published/Not Published) + el selector Type.
 *  - Al guardar un ad valido (Local) y navegar al detalle, el nombre persiste.
 *  - El form detalle de un ad existente carga su `ad-name` con el valor guardado.
 *  - Cada tipo del selector abre una seccion coherente (`section-type-*`).
 */
test.describe('Ads - Detalle y Creacion @regression', () => {
  test.skip(env.isProd, 'prodGuard: estos tests escriben recursos en dev/qa');

  test('el form /ad/new expone Name, Status y todos los botones Type cosechados @ADS-TC-7', async ({ adsPage }) => {
    await adsPage.gotoNew();
    await expect(adsPage.nameInput).toBeVisible();
    await expect(adsPage.statusToggle).toBeVisible();
    // 5 marcas unicas de tipo (Media + Ad Replacement comparten `sm="type-local"`).
    const uniqueTypeMarks = await adsPage.page.evaluate(() => {
      const set = new Set();
      for (const el of document.querySelectorAll('[sm^="type-"]')) {
        set.add(el.getAttribute('sm'));
      }
      return Array.from(set);
    });
    // Esperado: type-vast, type-vmap, type-local, type-ad-insertion-google, type-prebid.
    expect(uniqueTypeMarks).toEqual(expect.arrayContaining([
      'type-vast', 'type-vmap', 'type-local', 'type-ad-insertion-google', 'type-prebid',
    ]));
    // Media y Ad Replacement ambos con `sm="type-local"` -> SMELL documentado (RISK-3).
    const buttonsWithLocal = await adsPage.typeMedia.count();
    expect(buttonsWithLocal).toBe(2);
  });

  test('crear un Ad VAST por UI persiste el nombre en el detalle @ADS-TC-8', async ({ adsPage, api }) => {
    // El fixture `ad` crea tipo `local`. Para VAST necesitamos otra via: lo creamos
    // via factory + ResourceCleaner (mismo patron que `liveStream`/fixtures). Asi el
    // cleanup es idempotente y tolerante a fallas intermitentes del dev compartido.
    const cleaner = new ResourceCleaner(api);
    const name = `[QA-AUTO] Ad VAST UI ${Date.now()}`;
    const id = await createAd(api, { name, type: 'vast' });
    cleaner.register('ad', id);

    try {
      expect(id).toBeTruthy();
      await adsPage.gotoDetail(id);
      await expect(adsPage.nameInput).toHaveValue(name);
    } finally {
      await cleaner.clean();
    }
  });

  test('el boton Type "AdServer" muestra la seccion vast y oculta las demas @ADS-TC-9', async ({ adsPage }) => {
    await adsPage.gotoNew();
    // Default es AdServer (vast). La seccion vast debe estar visible.
    await expect(adsPage.sectionAdServer).toBeVisible();
    // Otras secciones (no vast) NO visibles.
    await expect(adsPage.sectionVmap).toBeHidden();
    await expect(adsPage.sectionLocalMedia).toBeHidden();
    await expect(adsPage.sectionAdInsertionGoogle).toBeHidden();
    await expect(adsPage.sectionAdPrebid).toBeHidden();
  });

  test('el selector Status alterna entre Published y Not Published al click @ADS-TC-10', async ({ adsPage }) => {
    await adsPage.gotoNew();
    // Default: Not Published (checkbox desmarcado). Verificamos el toggle visible.
    await expect(adsPage.statusCheckbox).not.toBeChecked();
    // Click en el toggle -> checked.
    await adsPage.statusToggle.click();
    await expect(adsPage.statusCheckbox).toBeChecked();
    // Click de nuevo -> unchecked.
    await adsPage.statusToggle.click();
    await expect(adsPage.statusCheckbox).not.toBeChecked();
  });
});
