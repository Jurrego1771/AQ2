# Quiz Manager — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual** aquí; el **comportamiento** vive en `historias.yaml` (AC)
> y `riesgos.yaml`. Módulo nuevo (2026-07-04), poblado tras explorar en vivo el fix de
> paginación de `mediastream/sm2#8032`. Antes vivía como cluster "Quiz Manager ⬜ pendiente" en
> `modules/media/overview.md` — se separa a módulo propio (mismo criterio que `thumbnails`)
> porque aplica a **dos recursos distintos** (live-stream y media) con comportamiento propio en
> cada uno (orden de clasificación, validación de intervalo).

Prefijo de IDs: **QUIZ** · UI: pestaña "Quiz Manager" en el detalle de `/live-stream/:id` y
`/media/:id` (no aplica a media de audio: guard `not @isAudio`). Requiere
`account.ops.media.quiz === true` habilitado en la cuenta (mismo flag para ambos recursos,
pese al nombre `media`). Cliente compartido: `src/client/partial/quiz.coffee` (`QuizManager`),
instanciado igual en `live_stream.coffee` y `media.coffee`.

## Endpoints (verificados en vivo, 2026-07-04)
| Acción | Live Stream | Media |
|---|---|---|
| Listar | `GET /api/live-stream/:id/quizzes` | `GET /api/media/:id/quizzes` |
| Crear | `POST /api/live-stream/:id/quizzes` | `POST /api/media/:id/quizzes` |
| Editar | `POST /api/live-stream/:id/quizzes/:quiz_id` (no PUT) | `POST /api/media/:id/quizzes/:quiz_id` (no PUT) |
| Borrar | `DELETE /api/live-stream/:id/quizzes/:quiz_id` | `DELETE /api/media/:id/quizzes/:quiz_id` |
| Enviar (solo live) | `POST /api/live-stream/:id/quizzes/:quiz_id/send` | — |

**Payload de creación** (idéntico en ambos, `Content-Type: application/json`):
```json
{ "title": "string", "timestamp": 100, "questions": [{ "text": "string", "options": [{ "text": "string", "isCorrect": true }] }] }
```
`timestamp` solo es relevante/usado por media (posición en segundos dentro del video); en
live-stream se ignora para el orden (se ordena por `date_created`).

## Contrato de paginación (`GET .../quizzes`) — verificado con 10 casos límite
- **Sin `page` ni `items_per_page`**: modo legado, hasta 200 resultados (antes del PR: 100),
  **sin** campo `pagination` en la respuesta.
- **Con cualquiera de los dos**: modo paginado activo. `page` default `1`. `items_per_page`
  default **`12`** si falta (⚠️ no 10 — ver nota abajo), clampeado a `[1, 100]`; valores
  inválidos (`0`, negativos, no numéricos) caen al default de 12.
- Respuesta en modo paginado agrega `pagination: { page, items_per_page, total, total_pages }`.
- `page` fuera de rango (más allá del total): `200 OK` con `quizzes: []`, no error.
- Helpers server-side compartidos: `utils.parsePaginationParams(req, defaultPageSize, maxPageSize)`
  y `utils.buildPaginationResponse(page, itemsPerPage, total)` (`src/server/utils.js`).

> ⚠️ **Nota de precisión**: la firma de `parsePaginationParams` en `utils.js` tiene
> `defaultPageSize = 10` como default de la función, pero **ambas rutas** (`live-stream` y
> `media`) la llaman explícitamente como `parsePaginationParams(req, 12, 100)` — el default
> real observado en producción es **12**, no 10. Confirmado empíricamente pidiendo
> `?page=1` sin `items_per_page`.

## Orden de clasificación — DISTINTO entre los dos endpoints (por diseño, no es un bug)
| Recurso | Campo | Dirección | Motivo |
|---|---|---|---|
| Live Stream | `date_created` | descendente (más nuevo primero) | quizzes de un evento en vivo no tienen posición en una línea de tiempo, solo momento de creación |
| Media | `trigger_time` | ascendente | coincide con la línea de tiempo del reproductor (VOD) |

Confirmado en vivo con datos reales: live-stream con 15 quizzes devuelve 15→1; media con
timestamps 40/100/160 devuelve 40→100→160.

## Validación de intervalo mínimo entre quizzes (SOLO media, no aplica a live-stream)
Antes del PR #8032 esta validación vivía en el **cliente** (`QuizManager` mantenía
`@quizInterval` en memoria y recorría todos los quizzes cargados). Al introducir paginación,
el cliente ya no tiene todos los quizzes en memoria simultáneamente — la validación se movió
al **servidor**: `src/server/routes/api/media/quizzes/assertQuizMediaTriggerInterval.js`,
aplicada tanto en `create.js` como en `update.js` (con `excludeQuizId` para no comparar un
quiz consigo mismo al editarlo).

- Intervalo configurado en `account.ops.media.quiz_interval` (minutos; cuenta de dev = 1 min = 60s).
- Regla verificada en vivo: distancia **estrictamente menor** al intervalo → rechaza con
  `400 { message: "There must be at least N minutes between quizzes." }`. Distancia **igual**
  al intervalo (límite exacto) → **acepta** (confirmado en ambas direcciones: antes y después
  del quiz de referencia). Esto es intencional, documentado en un comentario del propio código
  fuente (asimetría entre el filtro Mongo `$gte/$lte` inclusivo y el chequeo en memoria `<` estricto).
- Editar un quiz sin cambiar su `timestamp` (o a una posición válida) funciona aunque el propio
  quiz esté técnicamente "cerca de sí mismo" — `excludeQuizId` lo excluye del chequeo. Confirmado.

## Hallazgo menor: inconsistencia `id` vs `_id` entre creación y listado
`POST .../quizzes` devuelve el quiz creado con el campo transformado `id`. `GET .../quizzes`
devuelve el documento Mongoose crudo (`.lean()`) con `_id`, sin `id`. No es un bug visible para
el usuario final (la UI ya maneja esto correctamente en su propio código), pero es una trampa
real para quien escriba clientes/tests contra esta API directamente — ver `QUIZ-RISK-1`.

## UI — comportamiento confirmado en vivo (interacción real, no solo lectura de código)
- Botones `paginator-prev`/`paginator-next` se deshabilitan correctamente en los extremos
  (primera/última página).
- Cambiar el selector de tamaño de página (`quiz-page-size`, opciones `[5,10,15,20]`, default
  visual `5`) **resetea a la página 1** siempre, sin importar en qué página se estuviera.
- Borrar el único quiz restante de una página `> 1` navega automáticamente a la página
  anterior (lógica client-side en `deleteQuiz`, confirmado borrando 5 quizzes uno por uno hasta
  vaciar una página).
- El loader (`sm="quiz-loader"`) existe y se activa/desactiva alrededor de cada `loadQuizzes()`;
  no se capturó visualmente en pleno estado de carga (requeriría retrasar la respuesta
  artificialmente).

## Fuera de alcance de la exploración actual
El flujo de **"enviar"** un quiz durante un live (`send-quiz`, ícono de avión de papel) — la UI
indica *"Once sent, quizzes cannot be edited or deleted"*, sugiriendo un estado inmutable tras
enviarse. No probado. Candidato a una futura historia/riesgo si se explora.
