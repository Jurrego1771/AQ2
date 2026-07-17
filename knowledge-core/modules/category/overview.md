# Category — Overview estructural

> Modulo de gestion de categorias de media (sm2 vista categories.coffee).
> Endpoints publicos observables: `GET /api/category` y `GET /api/category/:id`.
> Endpoints `POST /api/category` y `POST /api/category/:id` (sm2 no expone PUT)
> quedaron habilitados para el bot QA el 2026-07-14 — ver CAT-RISK-4 (resuelto).
> El resto (`/api/category/{delete,image,media,ai-image}`) requieren permisos
> admin UI adicionales, no cubiertos.

## Contrato

- `GET /api/category` responde 200 con shape `{status:'OK', data:[Categoria...]}`
- `GET /api/category/:id` devuelve 200 con shape `{status:'OK', data:Categoria}` (si el id existe)
- Sin auth -> 403 `INVALID_TOKEN`
- El .select() del handler sm2 (categorias/index.js:239) filtra el shape a:
  `name description parent date_created image_url visible track app_feed drm custom slug filter_categories`.
  Los campos que NO aparecen no son accesibles via este endpoint.
- EXCEPCION documentada: el detail handler (GET /:id) tiene un .select() MAS
  corto que no incluye `inherit_access` (gap vivo CAT-RISK-5). Los listados
  (basico, ?full=true, ?with_count=true) SI proyectan el campo.

## Modelo de permisos

El handler hace dos pases de filtrado (linea 15 de `src/server/routes/api/category/index.js`):

1. Si el user NO es `is_account_admin`, se filtran las categorias por `user.categories[]`
   (categorias asignadas explicitamente al user).
2. Si es `is_account_admin`, ve todas las categorias de la cuenta.

## Inherit access (PR sm2#8507)

Campo `inherit_access` (Boolean, default false) en el schema. Activacion:
- UI: toggle 'Auto-grant subcategory access' (Inherit/Manual) en modales de
  crear/editar categoria — NO accesible desde el bot, ver CAT-RISK-9.
- API: POST /api/category y POST /api/category/:id con `inherit_access` en
  form-encoded (recomendado; string 'false' normaliza) o JSON (con gotcha
  CAT-RISK-8: `false` explicito cae fuera del guard truthy).

Disparo: hook post-save del modelo. Cuando una categoria se CREA (`_isNew`)
o se RE-PARENTA (`_parentModified`) bajo un parent con `inherit_access=true`,
los users con acceso al parent (misma cuenta) reciben la categoria nueva +
subarbol via `getAllWithChildren` (1 nivel efectivo, ver CAT-RISK-7) en su
`User.categories[]` por un `User.updateMany $addToSet`. Es fire-and-forget;
los errores se loguean sin romper el guardado principal. Grant-only:
nunca revoca (verificado por CAT-INH-R-004, R-011).

## Provisioning self-contained

Categorias: self-contained via `ApiClient.post('/api/category', ...)` con
`ResourceCleaner` y `qaName()`. Users (necesarios para HU-2/HU-3 que
verifican `User.categories`): self-contained via fixture `qaUserFactory`
(resuelve CAT-RISK-6, verificado 2026-07-15).

## Cobertura actual

- `tests/api/contract/category/category.api.contract.spec.js` (4 specs)
  - CAT-TC-001 GET /api/category (200 + Zod shape del envelope List)
  - CAT-TC-002 GET /api/category sin auth (403 INVALID_TOKEN, sin caer en 500)
  - CAT-TC-003 GET /api/category/:id (200 + Zod Get Response)
  - CAT-TC-004 GET /api/category/:fake_id (404 NOT_FOUND)
- `tests/api/smoke/category/category-crud.smoke.spec.js` (11 specs)
  - CAT-TC-005..015 CRUD basico
- `tests/api/smoke/category/category-inherit-access.smoke.spec.js` (8 specs)
  - CAT-INH-001..007 contrato y persistencia del flag `inherit_access`
- `tests/api/regression/category/category-inherit-access.regression.spec.js` (6 specs)
  - CAT-INH-R-001..R-006 comportamiento end-to-end del hook
- `tests/api/regression/category/category-inherit-access.gaps.regression.spec.js` (7 specs)
  - CAT-INH-R-007..R-013 brechas residuales (edit-sin-parent, parent='',
    2-user fan-out, grant-only reforzado, idempotencia, detail handler
    via POST update)

Total: 30 specs sobre el modulo category. 28 verde al 2026-07-15, 2
expected-fail (CAT-INH-002 detail handler, CAT-INH-R-002 recursion
grandchild, ambos documentados en riesgos.yaml).

## Pendiente / GAPs

- **UI toggle (PR #8507)**: HU-4 no cubierto por automatizacion. La nav del
  bot no expone /admin/category ni /settings/categories (404). Ver CAT-RISK-9
  y overview de `tests/ui/` (vacio, solo e2e/media).
- **AragonTV flow end-to-end con TokenProfile real**: ver TOK-RISK-001 en
  `knowledge-core/modules/token-profiles/riesgos.yaml`.
