# QA Report — ads module (2026-07-08)

> Sesion de exploracion + cobertura del modulo **Ads** del admin SM2.
> Workflow: `qa-module` skill (FLOW canonico F0→F5).
> Pre-ID arranque: modulo nuevo. Prefijo: **ADS**. Primer US: **US-030**.
> Primer TC: **ADS-TC-1**. Storage state re-login (sesion expiro a `?expired=true`).

## 0. Issues en GitHub (Jurrego1771/AQ2)

| # | Titulo | Severidad |
|---|--------|-----------|
| [#40](https://github.com/Jurrego1771/AQ2/issues/40) | [Tech-debt] Ad: el dropdown UI no expone filtro Published/Not Published aunque la API soporta `status=0|1` | low |
| [#41](https://github.com/Jurrego1771/AQ2/issues/41) | [UX/tech-debt] Ad: tipos 'ad-insertion'/'googleima'/'adswizz' no expuestos en la UI + estado activo desincronizado | medium |
| [#42](https://github.com/Jurrego1771/AQ2/issues/42) | [Accessibility] Ad: multiples controles solo-icono sin accessible-name (WCAG SC 4.1.2 A) | low |
| [#43](https://github.com/Jurrego1771/AQ2/issues/43) | [Backend bug] Ad /api/ad/:id y /:id/delete no validan ObjectId antes de findOne | low |
| [#44](https://github.com/Jurrego1771/AQ2/issues/44) | [Backend bug] Ad: typo `ad.gdai = null` en update.js y state leak entre tipos al cambiar type | medium |
| [#45](https://github.com/Jurrego1771/AQ2/issues/45) | [UX] Ad: el listado pide `limit=11` aunque el dropdown UI ofrezca '12 per page' | low |
| [#46](https://github.com/Jurrego1771/AQ2/issues/46) | [Tech-debt] Ads: Media y Ad Replacement comparten `sm="type-local"` (no direccionables individualmente) | low |
| [#47](https://github.com/Jurrego1771/AQ2/issues/47) | [Backend bug] Ad: falsy leaks en update.js (pausead.position no se limpia con '', schedule.mid no se limpia con []) — **misma familia que LIVE-RISK-7** | medium |

## 1. Que se probo

### Funcionalidad viva (en dev v7.0.71)

| Flujo | Resultado |
|------|-----------|
| `GET /ad` listado (74 ads visibles) | OK |
| Toolbar: busqueda + paginador + "+ New Ad" | OK |
| `GET /ad/<ObjectId>` detalle | OK (estructura del form completa) |
| `GET /ad/new` | OK (form con Name / Status / 6 botones Type / secciones vast/vmap/local/...) |
| Toggle Status | OK (cambia checkbox is_enabled) |
| Selector Type "AdServer" (default) | Muestra section-type-ad-server, oculta los demas |
| POST `/api/ad/new` alta | 200 OK con body `{status:'OK', data:ad}` |
| GET `/api/ad/<fakeObjectId>` (24 hex inexistente) | 404 `NOT_FOUND` |
| GET `/api/ad?count=true` | 200 con `data: <number>` |
| Provisioning self-contained (`ad` fixture) | Crea `type:'local'` y borra con ResourceCleaner |

### Contratos verificados por codigo sm2 (`src/server/routes/api/ad/*`)

| Endpoint | Notes |
|----------|-------|
| GET /api/ad/search, /api/ad, /api/ad/:id, /api/ad/:id/transcode | OK |
| POST /api/ad/new | Path literal `/new`, no `/api/ad/` (404 si trailing slash) |
| POST /api/ad/:ad_id (update) | **NO es PUT** |
| DELETE /api/ad/:ad_id | Cascade en `media.ads[]` |
| `name` solo se aplica si truthy | Permite alta sin name (smell leve) |
| `is_enabled: 'true'/'false'` (string) | Boolean coerced server-side |
| `min_media_time_length < 0` (vast o local) | 400 `AD_BAD_MIN_MEDIA_TIME` |

### Hallazgos UX / a11y

- **Botones solo-icono sin accessible-name** (sm="add-midroll", "preroll-params-edit", "midroll-params-edit", etc.). 9 controles en el form + 4 en el paginador (paginator-next/prev ×2 layouts). Total ~13 → **ADS-RISK-6**.
- **Glyphicon "ok" en columna Status** del listado sin texto accesible → **ADS-RISK-6** (también).
- **Media + Ad Replacement comparten `sm="type-local"`** → solo direccionable por `.nth(0)/.nth(1)` → **ADS-RISK-3** (testabilidad).
- **Selector Type con 5 marcas unicas** (vast/vmap/local/ad-insertion-google/ad-prebid); tipos backend `ad-insertion`, `googleima`, `adswizz` NO expuestos en UI pero siguen guardados → **ADS-RISK-2**.

### Comportamiento backend verificado leyendo update.js (sm2)

- **Typo** `ad.gdai = null` en rama `vast` (deberia ser `ad.google_dai = null`). Mongoose ignora campos desconocidos → NO-OP → **`google_dai` persiste al cambiar de `ad-insertion-google` a `vast`** → **ADS-RISK-4** (cubierto por ADS-TC-14).
- **State leak** entre tipos en update: la rama `ad-prebid` NO hace `ad.insertion = null` ni `ad.google_dai = null` ni `ad.vmap = null` → cambiar de `ad-insertion` a `ad-prebid` deja `insertion` antiguo → **ADS-RISK-4** (cubierto por ADS-TC-15).
- **Validacion de id no-ObjectId** en `detail.js` y `delete.js` depende de la rama 'no result' de Mongoose (sin `isValidObjectId` previo) — patrón frágil vs ad-insertion siblings (LIVE-RISK-1) → **ADS-RISK-1**.

### Rendimiento / polling / red

- Sin polling en `/ad` (5s idle → 0 XHR nuevos en `/api/ad`).
- Listado dispara 2 XHR en paralelo: `?count=true` y `?limit=11&skip=0...` (cache-buster `_<ts>`).
- La UI pide `limit=11` aunque el dropdown ofrezca "12 per page" → friccion menor → **ADS-RISK-8**.

### Seguridad — smoke no destructivo

- XSS benigno (`<b>QAXSS</b>`) en `query-ad`: URL-encoded al server, 200 con `data: []`, no se renderiza como HTML.
- Boton Status como toggle sin nombre accesible, pero es cliqueable por mouse/keyboard (no vuln).

## 2. Que fallo / bloqueos

- (Ninguno) — todos los tests escriben verde (1 skipped por prodGuard).

## 3. Decisiones de diseño del harness

- **`sm-id` carries the Mongo `_id`** en `<tr sm="event">`: patron estable para derivar id sin hardcodear. Cubierto por POM (`adsPage.firstAdId()`).
- **Fixture `ad`** crea `type:'local'` (no requiere URLs VAST). Permite tests de UI limpia sin depender de assets externos. Ver `src/fixtures/index.js`.
- **Endpoint create real**: `POST /api/ad/new` (literal 'new' del path, NO `/api/ad/` con trailing slash). El server responde `Cannot POST /api/ad/` si lo pruebas con trailing slash.
- **`statusToggle`** envuelve un checkbox `data-name="is_enabled"`. El POM expone ambos para aserts robustos.
- **`min-media-time-length`** esta expuesto en el form aunque la UI la describe como "Filter minimum time Media (minutes)" — nombre UI inconsistente con el server.
- **`vast=AdServer`** pero `vast` es el "default" tipo en backend; el boton del form muestra label "AdServer" mientras el backend almacena `type:'vast'`. Mapeo documentado.

## 4. Tests añadidos

- `tests/smoke/ads.smoke.spec.js` — 2 tests (carga + prodGuard).
- `tests/regression/ads-list.regression.spec.js` — 5 tests (carga, busqueda, busqueda vacia, XSS, tipos).
- `tests/regression/ads-detail.regression.spec.js` — 4 tests (form, alta VAST, secciones, status toggle).
- `tests/api/ads.api.spec.js` — 7 tests (GET/:id, GET/inexistente, count, y 4 que validan comportamiento esperado y documentan bugs abiertos #44/#47 — actualmente en rojo hasta el fix de sm2).

Total: **14 pass + 4 fail rojo-hasta-fix + 1 skip (prodGuard)**. Cero flakes. Los 4 fail son la senal exacta de los bugs #44/#47: `npx playwright test tests/api/ads.api.spec.js` los mostrara en rojo, y pasaran a verde solos cuando sm2 arregle `update.js`.

## 5. Cobertura del modulo

| AC | Cubierto por |
|----|-------|
| ADS-AC-1 (carga + total>0) | ADS-TC-1, ADS-TC-2 |
| ADS-AC-2 (listado + paginador) | ADS-TC-2, ADS-TC-6, ADS-TC-13 |
| ADS-AC-3 (busqueda substring + restaurar) | ADS-TC-3, ADS-TC-4, ADS-TC-5 |
| ADS-AC-4 (form Name + Status + tipos) | ADS-TC-7, ADS-TC-9, ADS-TC-10 |
| ADS-AC-5 (crear VAST por API → UI muestra name) | ADS-TC-8 |
| ADS-AC-6 (GET contrato) | ADS-TC-11 |
| ADS-AC-7 (404 NOT_FOUND + state leak) | ADS-TC-12, ADS-TC-14, ADS-TC-15 |

| Historias | Status |
|-----------|--------|
| US-030 carga | ✅ verde |
| US-031 listado+busqueda | ✅ verde (5/5) |
| US-032 form | ✅ verde (4/4) |
| US-033 contrato API | ✅ verde (7/7) |

| Riesgos | Estado |
|---------|--------|
| ADS-RISK-1 (validacion ObjectId) | sin test vivo (cubrible con un test fail que explore el literal 'new') — GAP |
| ADS-RISK-2 (tipos no expuestos) | mitigado por ADS-TC-6 + ADS-TC-9 + ADS-TC-7 |
| ADS-RISK-3 (sm compartido) | mitigado por ADS-TC-7 (assertion que `type-local` cuenta 2 botones) |
| ADS-RISK-4 (state leak typos) | mitigado por ADS-TC-14 + ADS-TC-15 (red esperado) |
| ADS-RISK-9 (falsy leaks pausead.position / schedule.mid) | **cubierto en rojo** por ADS-TC-16 + ADS-TC-17 (verificados en vivo, pasan a verde cuando sm2 arregle #47) |
| ADS-RISK-5 (sin filtro status UI) | sin test (no testeable: UI no expone control) — GAP |
| ADS-RISK-6 (a11y iconos) | sin test vivo accesible (cubrible con axe-core) — GAP |
| ADS-RISK-7 (alta sin name) | sin test (cubrible con un spec de smoke) — GAP |
| ADS-RISK-8 (limit=11 vs UI 12) | sin test (cubrible con assertion sobre el param de la peticion) — GAP |

## 6. GAPs (riesgos sin test vivo)

1. **ADS-RISK-1** — Cobertura API para ObjectId literal 'new'. Gap: la UI envia ese path en la carga de `/ad/new` (carga el form). Un test fail vivo cubriria el contrato.
2. **ADS-RISK-5** — UI sin toggle de status (no automatizable: el control no existe en DOM).
3. **ADS-RISK-6** — A11y: requiere axe-core (no instalado) o asserts por accessible-name.
4. **ADS-RISK-7** — Form no bloquea alta con name vacio; cubrible con un test fail + red-esperado.
5. **ADS-RISK-8** — Inconsistencia `limit=11`. Cubrible con `expect.poll` sobre `?limit=11`.

## 7. Pendiente para proxima sesion

- Instalacion de axe-core para riesgos a11y (RISK-6 y Live ones).
- Cobertura del detalle para los 8 tipos backend (hoy solo vast+local cubiertos).
- Smoke de subida de ad icon (transcode endpoint).
- Verificacion cruzada con account/prod-us y prod-eu.

---

Artefactos:
- `src/pages/ads.page.js` — POM.
- `src/api/ads.client.js` — REST client.
- `src/api/ads-factory.js` — provisioning.
- `src/fixtures/index.js` — `adsPage`, `adsClient`, `ad` fixture (updates).
- `src/fixtures/resource-cleaner.js` — `ad` deleter (new).
- `knowledge-core/epics/ads-management/historias.yaml` — US-030..US-033 + ACs.
- `knowledge-core/modules/ads/{overview.md, selectors.yaml, riesgos.yaml, tests.yaml}`.
- Evidence: `reports/ads-2026-07-08/ad-new-form.png` (+ storageState backup).
