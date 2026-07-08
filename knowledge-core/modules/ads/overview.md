# Ads — Overview estructural (mapa del módulo)

> Modulo de gestion de **Ads** (plantillas de anuncios publicitarios que se
> asocian a media o live-stream por Tags/Categorias/Referrers). Conocimiento
> **estructural** (barato/estable) aqui; el **comportamiento** vive en
> `historias.yaml` (AC) y `riesgos.yaml`, poblado explorando en vivo. La
> verdad es el entorno corriendo, no los `.coffee`.

Prefijo de IDs: **ADS** · Rutas verificadas: listado `/ad` (vista
`ads.coffee`), form (new + detail) `/ad/new` y `/ad/:id` (vista `ad.coffee`).
POM del modulo: `src/pages/ads.page.js`. Cliente API: `src/api/ads.client.js`.
Factory + ResourceCleaner: `src/api/ads-factory.js`. Entorno verificado: dev,
v7.0.71.

## Tipos de Ad (modelo = UI)

El backend (create.js / update.js de sm2) acepta 8 tipos como validos:

| Tipo backend   | Tipo UI expuesta | Marca `sm:` | Notas |
|----------------|------------------|-------------|-------|
| `vast`           | AdServer        | `type-vast` | Default si no se envia type. |
| `vmap`           | VMAP            | `type-vmap` | |
| `local`          | Media           | `type-local` (nth 0) | |
| `local`          | Ad Replacement  | `type-local` (nth 1) | SMELL: mismo `sm` (RISK-3). |
| `ad-insertion`   | (no en UI)      | **sin marca** | Legacy — filas siguen en la DB pero el form no permite alta ni cambio de tipo → **ADS-RISK-2**. |
| `ad-insertion-google` | Google MRSS Feed | `type-ad-insertion-google` | |
| `ad-prebid`      | Prebid          | `type-prebid` | |
| `googleima`      | (legacy, sin UI) |             | No hay UI; mantener en SMELL. |
| `adswizz`        | (legacy, sin UI) |             | No hay UI. |

## Endpoints del recurso `/api/ad`

Verificados en `src/server/routes/api/ad/*` (sm2):

| Metodo | Ruta              | Notas |
|--------|-------------------|-------|
| GET    | `/api/ad`         | Listado (select `name is_enabled type date_created`). Acepta `count=true` para solo total; `query=` filtra con regexp2 case-insensitive; `status=0` es "todos" en este modulo. Default el front pide `limit=11&skip=0&status=0`. |
| GET    | `/api/ad/:id`     | Detalle; 404 NOT_FOUND si no existe (no por ObjectId invalido necesariamente, ver ADS-RISK-1). |
| POST   | `/api/ad/`        | Alta. Devuelve `{status:'OK', data:ad}`. Error 400 `AD_BAD_MIN_MEDIA_TIME` si `<0`. |
| POST   | `/api/ad/:id`     | **Update via POST** (no PUT). Mismo jsonp. **Ver RISK-4 (typo `gdai`) y RISK-5 (leak de campos al cambiar tipo)**. |
| DELETE | `/api/ad/:id`     | Baja (cascade a referencias en `media.ads[]`, recursivo). |

## Listado `/ad`

- Encabezado: "Ads", boton **+ New Ad** (link a `/ad/new`).
- Toolbar de busqueda: input `sm="query-ad"` + boton lupa `sm="search"`.
- Contador: `1 - 11` de `total-ads=N` (sm).
- Paginador: `paginator` + `paginator-next` + `paginator-prev`.
- **Sin filtro de status en UI** aunque la API soporta `status=0` (todos) —
  la API distingue 0/1 pero el front solo envia 0. Hipotesis: el modulo solo
  lista ads publicados de facto; falta el toggle.
- Tabla con columnas `Status | Name | Type | Creation Date`. Filas:
  `<tr sm="event" sm-id="<ObjectId>">` — la `sm-id` lleva el Mongo `_id`.
- Status es un glyphicon (`<i class="glyphicon glyphicon-ok">`) sin texto
  accesible — **ADS-RISK-6** (a11y).

## Form `/ad/new` y `/ad/:id`

Estructura (verificada en vivo):
- **Preview** + **Media Inherited Ads** (categorias + tags) + **Referrers**
  (multi-selects `data-name`).
- **Basic Information**: `ad-name` (text), Status (toggle con checkbox
  `data-name="is_enabled"`), 6 botones Type, `preroll-skip-at` (select
  "Don't allow ... 30 seconds in"), `min-media-time-length` (number).
- **Tags / Pre-roll & Companion** (segun tipo): `preroll-tag`,
  `preroll-tag-mobile`, `add-midroll`, `midroll-0`, `postroll-tag`,
  `overlay-position`, `overlay-tag`, `pausead-tag`, `pausead-tag-mobile`,
  `pausead-duration`, `pausead-duration-mobile`, `pausead-position`,
  `pausead-close-button`, `pausead-close-text`, `pausead-view-more-text`.
- **Secciones por tipo**: `section-type-{ad-server, vmap, local-media,
  ad-insertion, ad-insertion-google, ad-prebid}` — solo una visible.
- **Save Changes**: boton `sm="save"`.

## Contrato del listado (verificado en vivo)

- `GET /api/ad?limit=11&skip=0&status=0&query=&_=<ts>` → datos, con cache-buster.
- `GET /api/ad?count=true&status=0&query=&_=<ts>` → solo total.
- Sin polling en idle (verificado 5s → 0 XHRs nuevos).
- `<b>QAXSS</b>` como query: el server filtra por regexp escapado y devuelve
  200 con `data: []` (no se renderiza nada → no XSS detectable en esta via).

## Contrato del detalle (verificado en vivo)

- `GET /api/ad/:id` con ObjectId valido → 200 + documento completo.
- `GET /api/ad/<ObjectId inexistente>` → 404 + `{status:'ERROR', data:'NOT_FOUND'}`.

## Reglas validadas en vivo

| Caso | Resultado | Estado |
|------|-----------|--------|
| Alta con name vacio | aceptado pero queryable -> aceptar que es bug leve | 🟡 ADS-RISK-7 |
| `min_media_time_length` negativo (VAST/Local) | 400 `AD_BAD_MIN_MEDIA_TIME` | ✅ ADS-TC-7 (cubierto por codigo) |
| Update conservando tipo | persiste | ✅ |
| Update cambiando tipo a uno nuevo (sin editar) | **state leak** entre campos no nulos | 🔴 ADS-RISK-5 |

## Testabilidad / marcas faltantes

- `sm="type-local"` compartido por **Media** y **Ad Replacement** → no se
  puede identificar un boton por `sm` unica → **ADS-RISK-3** (SMELL).
- `sm="save"` colisiona semanticamente con `sm="save"` del Live Stream y el
  `Save Changes` global; usar scope del page object para evitar colision
  entre specs.
- Botones solo-icono sin `aria-label`: `add-midroll`, `preroll-params-edit`,
  `preroll-params-mobile-edit`, `midroll-params-edit`, `postroll-params-edit`,
  `vmap-params-edit`, `vmap-mobile-params-edit`. **a11y SC 4.1.2 (A)**: **ADS-RISK-6**.
- Status del listado (glyphicon `ok`) sin nombre accesible. **a11y**: **ADS-RISK-6**.
- Botones `paginator-next` / `paginator-prev` con `<i class="glyphicon">` sin
  `aria-label` ni titulo en `<a href="#next|#previous">`. **a11y**: **ADS-RISK-6**.

## Provisioning self-contained

- `POST /api/ad/` (alta) es el patron "drop and go": crea y devuelve `_id`.
- DELETE se hace en cascada — quitar la referencia en cada `Media.ads[]`
  antes de `ad.remove(true)`.
- Fixture `ad` (en `src/fixtures/index.js`): crea uno con `type: 'local'` (no
  exige URLs externas) y lo borra al terminar.
- Cache-buster `_<ts>`: el listado siempre pasa. En specs no se mockea —
  se trabaja contra el dev compartido.
- 0% cobertura historica del modulo. Smoke + regression UI + API fueron
  escritos durante esta primera exploracion (2026-07-08).
