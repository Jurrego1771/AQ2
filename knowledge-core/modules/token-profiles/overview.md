# Token Profiles — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual** aquí; el **comportamiento** vive en `historias.yaml`
> (AC) y `riesgos.yaml`. Módulo nuevo (2026-07-03), originado en la revisión de
> `mediastream/sm2#8451`. La mayor parte de este módulo está **bloqueada para
> exploración/testing en vivo** con la cuenta QA actual — ver "Bloqueos de acceso" abajo
> antes de asumir que algo es explorable o que un token de prueba sirve para testear esto.

Prefijo de IDs: **TOK** · UI de gestión de perfiles: `/admin/account` → pestaña "Token
Profiles" (vista/cliente `admin_accounts.coffee`). UI de creación de tokens (self-service,
a nivel de cuenta): `/settings/api` (vista/cliente `settings/api.coffee`). API de gestión
de perfiles: `/api/admin/platform/token-profiles`. API de tokens de cuenta:
`/api/account/token`. API de consumo (recurso protegido, usado como ejemplo para probar
el gate): `/api/category`.

## Qué es
Un **Token Profile** (`model.TokenProfile`) es una lista de módulos (`modules: [String]`,
validada por `enum`) que se puede asignar a un **API Token** de una cuenta
(`model.Token.profile` → referencia al `TokenProfile._id`). Cuando un request llega
autenticado por token (no por sesión), el middleware `module-access.js` exige que el
módulo de la ruta esté en `tokenProfile.modules` — además de que la cuenta tenga el
módulo raíz activado (`ACCOUNT.modules.<módulo_sin_sufijo>`).

## ⚠️ Trampa descubierta: un token "normal" NUNCA tiene perfil, y por lo tanto NUNCA
## pasa por este gate — probarlo con un token cualquiera da un falso positivo

El formulario de creación de token en `/settings/api` (`views/settings/api.coffee` línea
46-52) renderiza el `<select>` de **Profile` SOLO si `@USER?.is_admin is true`**:
```coffee
if @USER?.is_admin is true
  select ... sm: 'token-profile', -> ...
```
Para cualquier usuario sin ese flag (incluida la cuenta QA), ese campo **no existe en el
DOM**. El cliente (`settings/api.coffee`) lo refleja explícitamente:
`@canUpdateProfile = !!$('[sm="token-profile"]')?.length` — si el select no está, nunca
se manda `profile` al crear el token. Un token creado así siempre tiene `profile: null`.

**Consecuencia**: con `profile: null`, `res.locals.TOKEN_PROFILE` queda `falsy` en el
middleware, que toma la rama **sin** restricción de perfil (solo exige que la cuenta
tenga el módulo raíz activo). Un `GET /api/category` con un token así de la cuenta QA
devuelve `200` — pero **no prueba nada de `sm2#8451`**: ese `200` ocurre por una razón
totalmente distinta (módulo `media` activo a nivel de cuenta), sin tocar la lógica de
Token Profiles en absoluto. **Un test que use ese token y lo presente como validación de
TOK-AC-1 sería un falso positivo.** (Se escribió y luego se eliminó un test así en esta
sesión al descubrir el problema — ver `git log` si hace falta recuperarlo como referencia
de qué NO hacer.)

## Bloqueos de acceso (confirmado en vivo, 2026-07-03, cuenta QA dev)
| Acción | Endpoint | Resultado con el bot QA | Permiso que falta |
|---|---|---|---|
| Ver/crear/editar Token Profiles (documentos) | `GET/POST /api/admin/platform/token-profiles` | `403 "Forbidden (admin only)"` | `USER.is_admin === true` (staff de plataforma) — **sin excepción, es la única vía** |
| Abrir la UI de gestión de perfiles | `GET /admin/account` | `403 "Forbidden (admin only)"` | mismo que arriba |
| Ver el dropdown "Profile" al crear un token | `/settings/api` (UI) | Campo ausente del DOM | mismo que arriba — condición `@USER?.is_admin` en el template |
| Crear/editar un token, **incluido asignarle `profile`** | `POST /api/account/token` | `403 "...does not have access to this module"` (hoy) | módulo de cuenta `api_tokens` + `ACCOUNT_ADMIN_ACCESS` — **NO requiere `is_admin`** (`AUTH_ADMIN_MODULE` acepta `is_admin` O el permiso de rol normal, es un OR) |
| Consultar `/api/category` **con sesión normal** (sin token) | `GET /api/category` | `200 OK` | — (funciona; pero **no ejercita** el código de Token Profiles, es una rama distinta) |

**Lectura clave**: hay UN solo bloqueo verdaderamente exclusivo de `is_admin` de
plataforma — crear los documentos `TokenProfile` en sí. Una vez que esos documentos
existen (con y sin `media.category`), **asignarlos a un token es alcanzable con un
permiso de cuenta normal** (`api_tokens` habilitado), porque `POST /api/account/token`
no filtra el campo `profile` por `is_admin` en el servidor — solo la UI lo esconde.

## Pedido de acceso correcto (mínimo, una sola vez)
1. Un admin de plataforma crea **dos** `TokenProfile`: uno con `modules` incluyendo
   `'media.category'`, otro sin él (lista vacía o con otro módulo cualquiera).
2. Un admin habilita el módulo de cuenta `api_tokens` en la cuenta QA de dev (y el rol
   del usuario QA debe calificar para `AUTH_ADMIN_MODULE`/`ACCOUNT_ADMIN_ACCESS` — a
   confirmar en vivo una vez habilitado).
3. Con eso, AQ2 puede crear/borrar sus propios tokens **self-contained por test** (mismo
   patrón que `transcodedMedia`/`liveStream`), pasando `profile: <id>` directo por API
   (`POST /api/account/token`), sin depender de la UI ni de `is_admin` en cada corrida.
   Los dos ids van en `.env` (`TOKEN_PROFILE_ID_WITH_CATEGORY_DEV` /
   `TOKEN_PROFILE_ID_WITHOUT_CATEGORY_DEV`, ver `.env.example`).

## Contrato de autenticación por token (verificado leyendo código, `api-auth-read.js`)
- El token se acepta como **query param** `?token=<valor>` **o** header `x-api-token`.
- **Prioridad**: si la request trae sesión (`res.locals.USER.account`), el middleware
  usa esa rama y **el token se ignora por completo** — para probar el gate de Token
  Profiles, el request debe ser sin cookies de sesión (contexto de API dedicado, no el
  fixture `api` de este repo, que sí lleva `storageState`).
- Doble capa de validación cuando hay `TOKEN_PROFILE`: (1) `tokenProfile.modules`
  incluye el módulo exacto (`'media.category'`, con el punto) Y (2) `ACCOUNT.modules`
  tiene activado el prefijo sin sufijo (`ACCOUNT.modules.media === true`). Ambas deben
  cumplirse; confirmado que la cuenta QA de dev sí tiene `media` activado (capa 2 OK).

## Cobertura actual en AQ2
**Ninguna.** Se intentó un test (`TOK-TC-001`) con un token sin perfil y se descartó al
confirmar que no ejercita el código bajo prueba (ver sección de la trampa, arriba). Sin
los dos `TokenProfile` ids + el módulo `api_tokens`, no hay forma de construir un fixture
válido para `TOK-AC-1` ni `TOK-AC-2`. Ver `TOK-RISK-001`.

## Selectores
No hay marcas `sm:` cosechadas todavía para la gestión de perfiles (`/admin/account`,
nunca se pudo cargar con la cuenta QA). El formulario de `/settings/api` **sí** es
explorable (no requiere `is_admin`, salvo el campo Profile) — marcas conocidas por
lectura de código: `token-access` (select read/write), `token-description`,
`token-distributor` (condicional), `token-profile` (condicional, solo admin),
`token-create`, `token-edit`, `token-toggle`, `token-delete`, `tokens` (tbody). Sin
cosechar en vivo todavía.
