# Category — Overview estructural

> Modulo de gestion de categorias de media (sm2 vista categories.coffee).
> El endpoint publico observable es `GET /api/category` (`/api/category/:id`).
> Otros endpoints bajo `/api/category/{create,update,delete,image,media,ai-image}` existen
> server-side pero requieren permisos admin (MIDDLEWRITE.AUTH_ADMIN) - no cubiertos
> desde la cuenta bot QA.

## Contrato verificado en vivo (dev v7.0.71, botqa@mediastre.am)

- `GET /api/category` responde 200 con shape `{status:'OK', data:[Categoria...]}`
- `GET /api/category/:id` devuelve 200 con shape `{status:'OK', data:Categoria}` (si el id existe)
- Sin auth -> 403 `INVALID_TOKEN`
- El .select() del handler sm2 (categorias/index.js:239) filtra el shape a:
  `name description parent date_created image_url visible track app_feed drm custom slug filter_categories`.
  Los campos que NO aparecen no son accesibles via este endpoint.

## Modelo de permisos

El handler hace dos pases de filtrado (linea 15 de `src/server/routes/api/category/index.js`):

1. Si el user NO es `is_account_admin`, se filtran las categorias por `user.categories[]`
   (categorias asignadas explicitamente al user).
2. Si es `is_account_admin`, ve todas las categorias de la cuenta.

## AragonTV flow (PR sm2#8451)

A partir del PR sm2#8451, clientes externos (AragonTV) pueden acceder a GET /api/category
usando un **API token** cuyo TokenProfile incluya `'media.category'` en `modules[]`. Cobertura
del flow end-to-end en `tests/api/token-profile.gate.spec.js` (gateado por env vars
`TOKEN_PROFILE_ID_WITH_CATEGORY_DEV` y `..._WITHOUT_CATEGORY_DEV`).

## Provisioning self-contained

**No existe** un factory self-contained para crear categorias desde la cuenta QA: el bot
no tiene `category` module habilitado en su account (verificado 2026-07-08: 403 al intentar
POST). Los specs son todos read-only contra categorias pre-existentes en dev.

## Testabilidad

- Conteo real observado en dev (sesion 2026-07-08): **8 categorias** listadas en cuenta QA.
- UI admin (/admin/category) NO es accesible con botqa (Forbidden admin-only).
- API GET funciona con cookies de user (no requiere admin).

## Cobertura actual

- `tests/api/contract/category.api.contract.spec.js` (nuevo en sesion 2026-07-08):
  - CAT-TC-001 GET /api/category (200 + Zod shape del envelope List)
  - CAT-TC-002 GET /api/category sin auth (403 INVALID_TOKEN, sin caer en 500)
  - CAT-TC-003 GET /api/category/:id (200 + Zod Get Response)
  - CAT-TC-004 GET /api/category/:fake_id (404 NOT_FOUND)

## Pendiente / GAPs

- POST/PUT/DELETE categorias: requieren permisos admin que el bot QA no tiene.
  Cobertura futura cuando se configure `api_tokens` module en la cuenta.
- AragonTV flow end-to-end con TokenProfile real: ver TOK-RISK-001 en
  `knowledge-core/modules/token-profiles/riesgos.yaml`.
- Test del side-server del fix sm2#8451: una vez mergeado el PR, se deberia agregar
  test que verifique que un token con `media.category` en `modules[]` obtenga 200 en
  `/api/category` desde fuera del bot QA.
