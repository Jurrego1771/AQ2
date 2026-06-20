# AQ2 — Automatización de pruebas (Playwright + JS)

Suite de pruebas en **JavaScript plano** (sin TypeScript) sobre Playwright Test.

## Requisitos

- Node.js ≥ 20
- Navegadores Playwright: `npx playwright install --with-deps chromium`

## Setup

```bash
npm ci
cp .env.example .env   # completar BASE_URL, API_BASE_URL y credenciales QA
```

> Nunca apuntes `.env` a un entorno **prod mutante**: las pruebas crean y borran datos.

## Comandos

| Script              | Qué corre                                          |
| ------------------- | -------------------------------------------------- |
| `npm test`          | Toda la suite                                      |
| `npm run smoke`     | `@smoke` — login + carga de módulos críticos       |
| `npm run api`       | `@api` — contrato + CRUD + RBAC negativo (grueso)  |
| `npm run e2e`       | `@e2e` — flujos críticos de dinero/media           |
| `npm run regression`| Crece con cada bug encontrado                      |
| `npm run report`    | Abre el último HTML report                         |
| `npm run codegen`   | Grabador de Playwright                             |

## Estructura

```
playwright.config.js      Config (proyectos: setup, smoke, api, e2e, regression)
.env                      BASE_URL, creds por entorno (no se commitea)
src/
  pages/                  Page Objects (POM). Selectores SOLO vía sm() sobre [sm="..."]
  api/                    Clientes REST por recurso (sobre el Swagger de sm2)
  fixtures/               auth.setup (login 1 vez → storageState), data.factory (faker), fixtures compartidas
  flows/                  Flujos de negocio compuestos (UI + API)
  utils/selectors.js      sm(name) => `[sm="${name}"]`
tests/
  smoke/   api/   e2e/   regression/
.github/workflows/qa.yml  smoke en cada PR · api+e2e nocturno
```

## Convenciones clave

- **Selectores:** únicamente `sm('nombre')` → `[sm="nombre"]`. Prohibido texto/clase/XPath.
- **Login:** una sola vez en `src/fixtures/auth.setup.js`, reutilizado vía `.auth/user.json`.
- **API:** un cliente por recurso heredando de `BaseClient`.
- **Tags:** `@smoke`, `@api`, `@e2e`, `@regression` para filtrar por proyecto/grep.
- **Datos:** generados con `data.factory.js` (faker), con overrides por caso.

## Pendiente de ajustar a la app real

Las marcas `[sm="..."]` y rutas (`/login`, `/media`, `app.shell`) son placeholders.
Reemplázalas por las reales del front y los endpoints del Swagger de sm2.
