# Category — Overview estructural

> Modulo de gestion de categorias de media (sm2 vista categories.coffee).
> El endpoint publico observable es `GET /api/category` (`/api/category/:id`).
> Otros endpoints bajo `/api/category/{create,update,delete,image,media,ai-image}` existen
> server-side pero requieren permisos admin (MIDDLEWRITE.AUTH_ADMIN) - no cubiertos
> desde la cuenta bot QA.

## Contrato

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

## Provisioning self-contained

**No existe** un factory self-contained para crear categorias desde la cuenta QA: el bot
no tiene `category` module habilitado en su account. Los specs son todos read-only
contra categorias pre-existentes.

## Cobertura actual

- `tests/api/contract/category/category.api.contract.spec.js`:
  - CAT-TC-001 GET /api/category (200 + Zod shape del envelope List)
  - CAT-TC-002 GET /api/category sin auth (403 INVALID_TOKEN, sin caer en 500)
  - CAT-TC-003 GET /api/category/:id (200 + Zod Get Response)
  - CAT-TC-004 GET /api/category/:fake_id (404 NOT_FOUND)

## Pendiente / GAPs

- POST/PUT/DELETE categorias: requieren permisos admin que el bot QA no tiene.
  Cobertura futura cuando se configure el modulo correspondiente en la cuenta.
- AragonTV flow end-to-end con TokenProfile real: ver TOK-RISK-001 en
  `knowledge-core/modules/token-profiles/riesgos.yaml`.
