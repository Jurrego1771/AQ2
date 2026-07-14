# MoAI Options — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual** aquí; el **comportamiento** vive en
> `historias.yaml` (AC) y `riesgos.yaml`. Módulo nuevo (2026-07-14), explorado en
> vivo contra dev. Prefijo de IDs: **MOAI**.

## Qué es
Pantalla de configuración de IA de la cuenta. UI: **`/settings/ai`** (breadcrumb
"Settings / MoAI Options", vista `views/settings/ai/index.coffee`). Agrupa la
config de todas las features de IA + los tokens MCP.

No confundir con **`/machine-learning`** ("AI Studio" en el sidebar): esa es otra
pantalla, el **catálogo de reconocimiento facial** (personas para face-recognition),
no la config de IA generativa.

## Secciones (cosechadas en vivo 2026-07-14, dev v7.0.75)
1. **MCP Tokens** — emitir tokens para Model Context Protocol (mismo patrón que los
   API tokens de `/settings/api`: Read / Read+Write "coming soon", description,
   expiration, create). Marcas: `mcp-token-{description,access,expiration,create}`,
   `mcp-tokens` (tbody), `mcp-copy-server-url`.
2. **AI Faces** — reconocimiento facial, appearance time per person.
3. **AI Audio Transcription** — toggle auto-transcript + modelos (Deepgram/Whisper),
   `save-transcription-model`.
4. **AI Metadata / Highlights / Article / I18n / Chapters Generation** — cada una con
   su modelo configurable (`ai-<feature>-model-name`, `save-<feature>-model`,
   `save-changed-<feature>-model` en edición).
5. **AI Images** — modelo **Gemini** (`gemini-3.1-flash-image-preview`).
6. **Prompts** — CRUD de prompts custom por feature. Modal con `prompt-title`,
   `prompt-text`, `prompt-type`, `save-prompt`. Botones de abrir/editar/mejorar SIN
   sm: (usan id: `#add-<feature>-prompt`, `#edit-prompt-<id>`, `#improve-prompt-<id>`
   con icono sparkles) — ver MOAI-RISK-1.
7. **Guardado global** — `save` (persiste los settings de la página).

## Contrato de API (paths capturados de la RED REAL, no inferidos del código)
| Acción | Método + path | Notas |
|---|---|---|
| Listar prompts | `GET /api/settings/ai/prompts` | 200, `data: [{_id,title,type,customPromptText,isDefault}]` |
| Crear prompt | `POST /api/settings/ai/prompts` | form: `title`, `customPromptText`, `type` (enum: metadata/highlights/chapters/article/ai_images) |
| Borrar prompt | `DELETE /api/settings/ai/prompts/:id` | 200 |
| Mejorar prompt (IA viva) | `POST /api/settings/ai/prompts/:id/improve` | body: `id`, `title`, `customPromptText`. Llama OpenAI. Respuesta: `data.data.{status,model,duration,tokensCount,data.{title,prompt},error}` |

> ⚠️ El routing de sm2 es por convención de carpetas: los `.js` en
> `routes/api/settings/ai/prompts/` (create/update/delete/improve) NO se montan como
> `/prompts/create` etc. — se montan por verbo sobre `/prompts` y `/prompts/:id`.
> Verificar siempre el path real en vivo (capturando la red), no del nombre del archivo.

## Estrategia de QA para IA (clave de este módulo)
- **Determinista** (CRUD prompts, config de modelos, validación 400): aserción exacta.
- **No-determinista** (improve/transcription/ai-image): aserción de **CONTRATO**
  (estructura + ciclo `pending→completed`/`failed` + `usage-ai`), **nunca** del
  contenido generado (flaky por diseño y quema cuota del proveedor).
- Tests de invocación viva → guard `QA_SKIP_AI_LIVE=1` para desactivar; `prodGuard`
  bloquea escrituras en prod. Validar *calidad* del output = eval offline separado,
  fuera de la regresión.

## Cobertura actual en AQ2 (sesión 2026-07-14)
- API: `tests/api/integration/moai/moai-prompts.integration.spec.js` — MOAI-TC-1..5.
- UI: `tests/smoke/moai/moai.smoke.spec.js` — MOAI-TC-6.
- **GAP**: contrato de las otras invocaciones vivas (transcription/Deepgram,
  ai-image/Gemini, highlights, chapters), MCP Tokens CRUD, y config de modelos por
  feature. Ver MOAI-RISK-3.

## Selectores
Cosechados en vivo (no inferir de `.coffee`). Los botones de prompt (add/edit/improve)
son el único gap sm: conocido (MOAI-RISK-1); el resto expone sm:.
