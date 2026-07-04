# Alerta "changed by another user" — grafo transversal

> Mecanismo compartido por varios recursos (live-stream, media, article), origen
> `mediastream/sm2#8317`. Ver `epics/collaboration-alerts-management/historias.yaml` (US-019)
> para las historias/AC, y `cross-cutting/custom-attributes/riesgos.yaml` (ATTR-RISK-001) para
> el riesgo de fondo que esta feature mitiga parcialmente (no lo resuelve estructuralmente).

## Mecanismo
- **Servidor**: cada endpoint de update (`media/update.js`, `live-stream/update.js`,
  `article/update.js`) publica, tras un guardado exitoso, un evento websocket
  `/{recurso}/:id/changed` con `{ userId: <quien guardó> }` (fire-and-forget, no bloquea la
  respuesta HTTP).
- **Cliente**: cada detalle (`media.coffee`, `live_stream.coffee`, `article/detail.coffee`) se
  suscribe a ese canal al cargar la página; si el `userId` recibido no coincide con el propio,
  muestra `utils.send_alert('This <recurso> was updated by another user. Refresh the page to
  see the latest changes.', 'warning')`.
- El banner usa `sm="global-alert"` y `position: fixed` — **importante para tests**:
  `offsetParent` reporta `null` en elementos `position: fixed` aunque estén visibles (quirk de
  layout, no es un bug); usar `toBeVisible()`/`getBoundingClientRect()`, no `offsetParent`.
- El `userId` de comparación del lado cliente queda embebido en la página al cargar (no se
  re-consulta); cambios de sesión en OTRA pestaña del mismo browser no lo afectan, porque
  comparten cookies pero no el estado JS ya cargado.

## Verificado en vivo (2026-07-03)
Con dos sesiones reales (`botqa` observando, un segundo usuario guardando):
- **Live-stream**: banner aparece en la sesión ajena (2/2 guardados); quien guarda no se
  autoalerta (ve "Your changes have been saved" en su lugar).
- **Media**: banner aparece en la sesión ajena (1/1 guardado).
- **Article**: no probado en vivo (mismo código exacto revisado en el análisis del PR original,
  alta confianza por analogía — GAP menor si se quiere cerrar).

## Cobertura automatizada
`tests/regression/changed-by-other-user-alert.regression.spec.js` — `LIVE-TC-15` / `MED-TC-024`.

**Diseño del test**: la sesión que edita NO usa un browser real — el servidor solo mira la
cookie de sesión del request, sin importar si vino de un `<form>` o de una llamada API directa.
Se usa un segundo `APIRequestContext` autenticado en paralelo
(`src/api/second-session.js` → `loginAsSecondUser`), mucho más rápido y estable que un segundo
browser real (que además comparte cookies con cualquier otra pestaña del mismo browser — ver
nota de "orden de sesión" abajo). Solo la sesión que **observa** necesita ser un browser real,
porque el banner llega por websocket y se renderiza ahí.

**Requiere** `TEST_USER2_<ENV>` / `TEST_PASS2_<ENV>` en `.env` (ver `.env.example`) — un usuario
normal, no requiere `is_admin`. Sin esas variables, los specs se skipean automáticamente.

## Nota de orden de sesión (si se prueba manualmente con dos pestañas de browser)
Dos pestañas del mismo browser comparten cookies (mismo cookie jar) — no alcanza con abrir una
segunda pestaña para simular un segundo usuario. Si se hace manualmente: la pestaña
"espectadora" debe cargar la página **primero**, con la cookie del usuario que debe ver la
alerta (el `userId` de comparación queda embebido en esa carga). Recién después cambiar la
sesión de la otra pestaña al segundo usuario y guardar — si se invierte el orden, la carga
"fresca" de la pestaña espectadora queda embebida con el usuario equivocado.
