# Ambientes y estrategia de ejecución

> Cómo se resuelve cada ambiente y QUÉ se corre en cada uno. La config vive en
> `src/utils/env.js` (selecciona por `ENV` → sufijo `_DEV/_QA/_PROD_US/_PROD_EU`)
> y los secretos en `.env` (local) / GitHub Actions secrets (CI). Nunca commitear secretos.

## Ambientes
| ENV | URL | 2FA | Mutaciones | Rol en la estrategia |
|-----|-----|-----|------------|----------------------|
| `dev` | https://dev.platform.mediastre.am | No | **Sí** (crea/borra) | Desarrollo de tests + watch principal |
| `qa` | https://qa.platform.mediastre.am | Sí (TOTP) | Sí | Validación pre-deploy (si espeja prod) |
| `prod-us` | https://platform.mediastre.am | Sí (TOTP) | **No** (read-only) | Monitoreo de producción US |
| `prod-eu` | https://eu.platform.mediastre.am | Sí (TOTP) | **No** (read-only) | Monitoreo de producción EU (**faltan módulos**) |

## prodGuard — regla de oro
- `env.isProd` es `true` cuando `ENV` empieza con `prod`.
- **Todo test que escriba** (crear/editar/borrar recursos) debe llevar
  `test.skip(env.isProd, 'no se ejecutan escrituras contra prod (prodGuard)')`
  (a nivel `beforeEach` del describe, para no instanciar fixtures de provisioning).
- Contra prod corre **solo lo read-only**: smoke (carga del módulo), listados,
  búsquedas, GETs de contrato. Sirve como monitoreo del producto en vivo.

## Disponibilidad de módulos por ambiente (LLENAR EN EXPLORACIÓN)
> prod-eu no tiene todos los módulos. Esta matriz se completa entrando a cada
> ambiente (read-only) y revisando el nav (`[sm^="nav-header-"]`) + acceso real a
> cada vista. `✅` activo · `❌` ausente/sin acceso · `?` por verificar.

| Módulo (nav) | dev | qa | prod-us | prod-eu |
|--------------|:---:|:--:|:-------:|:-------:|
| dashboard | ✅ | ? | ? | ? |
| media | ✅ | ? | ? | ? |
| live-stream | ✅ | ? | ? | ? |
| machine-learning (AI Studio) | ✅ | ? | ? | ? |
| image | ✅ | ? | ? | ? |
| article | ✅ | ? | ? | ? |
| live-editor | ✅ | ? | ? | ? |
| playout | ✅ | ? | ? | ? |
| fast-channel | ✅ | ? | ? | ? |
| smart-flow | ✅ | ? | ? | ? |
| show | ✅ | ? | ? | ? |
| ad | ✅ | ? | ? | ? |
| next | ✅ | ? | ? | ? |
| analytics | ✅ | ? | ? | ? |
| widget | ✅ | ? | ? | ? |
| customer | ✅ | ? | ? | ? |
| channel | ✅ | ? | ? | ? |
| cdn | ✅ | ? | ? | ? |

> Fuente dev: nav cosechado en vivo (21-jun-2026). Completar qa/prod-us/prod-eu
> cuando estén las credenciales.

## Gating de tests por módulo ausente
Para módulos que no existen en un ambiente (p.ej. prod-eu), el test del módulo
debe **skipear** en ese ambiente — no fallar. Opciones:
- `test.skip(env.name === 'prod-eu', 'módulo no disponible en EU')` puntual, o
- (cuando haya volumen) un mapa de disponibilidad derivado de esta matriz.

## CI por ambiente
- **dev**: suite completa (mutante). Gate en push/PR + corrida agendada.
- **prod-us / prod-eu**: solo read-only (smoke + listados/GETs), agendado
  post-deploy. Secrets propios por ambiente (`*_PROD_US`, `*_PROD_EU`), con TOTP.
- Ver `.github/workflows/qa.yml` (matriz de ambiente vía `ENV`).
