# Test Provisioning — Estrategia self-contained con limpieza garantizada

> Cross-cutting. Concierne a TODOS los módulos: cualquier test que cree datos
> en el entorno (dev/QA) es responsable de su propia limpieza. Sin excepciones.

## Principio rector

> **Cada test crea su propio escenario y al terminar borra todo lo que creó.**
> Si un test no puede garantizarlo, no debe ejecutarse contra un entorno
> compartido.

- **Default**: entorno compartido (dev / QA). Datos de otros tests / humanos /
  paralelos coexisten. Cualquier `[QA-AUTO]` no barrido **contamina** el ambiente
  y degrada corridas futuras.
- **Nunca** depender de un setup global que pre-cree datos: si ese setup falla o
  se corre un solo test, no hay datos.
- **Nunca** reusar un recurso existente (e.g., un live-stream de otro autor)
  para escribir/leer: no es estable y depende de su ciclo de vida.
- La limpieza debe ser **best-effort idempotente** (un fallo de teardown no
  convierte un test verde en rojo) pero también **auditable** (al final del run
  sabemos cuántos residuos quedaron).

## Diagnóstico del estado actual (2026-07-09)

| Pieza | Estado | Ubicación | Comentario |
|---|---|---|---|
| `ResourceCleaner` | ✅ Existe | `src/fixtures/resource-cleaner.js` | Best-effort, 3 pases, delay 500ms, 404 = OK |
| DELETERS table | ⚠ Parcial | `resource-cleaner.js:17-22` | Solo 4 tipos: media, live-stream, playlist, ad |
| Fixtures self-contained | ✅ Existen | `src/fixtures/index.js` | `liveStream`, `audioLiveStream`, `transcodedMedia`, `ad` |
| Factories por recurso | ✅ Existen | `src/api/{live-stream,media,ads}-factory.js` | `createLiveStream`, `createTranscodedMedia`, `createAd` |
| Naming `[QA-AUTO]` | ⚠ Débil | diseminado | Sin correlación de run/worker; dos tests paralelos pueden colisionar |
| **Global safety-net** | ❌ No existe | — | Sin `globalSetup`/`globalTeardown`. Crash = leak |
| **Sweep por nombre** | ❌ No existe | — | Imposible barrer huérfanos `[QA-AUTO]*` por convención |
| **Concurrency limit** | ❌ No existe | — | N workers pueden martillar el dev con N POSTs paralelos |
| **Auto-tracking** | ❌ No existe | — | `register()` es manual; fácil olvidarlo |
| **Cascade-aware** | ⚠ Parcial | `DELETERS` | Solo borra el padre; no borra explícitamente hijos |
| **Métricas de leak** | ❌ No existe | — | No sabemos cuántos recursos quedaron al final |
| **Lock anti-concurrencia** | ❌ No existe | — | Dos runs simultáneos contra el mismo dev se pisan |

Evidencia del problema en esta sesión:
- LIVE-TC-4 (listado) vio `total=34` post-clear vs baseline `34` → **-1**:
  otro worker borró un `[QA-AUTO]` entre `baseline` y `clear`.
- Schedule-songmeta tests fallaron con **HTTP 502 Bad Gateway** del nginx
  upstremeando POST `/api/live-stream/`: el dev compartido no soporta la
  concurrencia que la suite le mete.

## Estrategia propuesta — 9 capas independientes

Las capas son **independientes**: cada una cubre una clase de fallo. Tener
varias es defense in depth, no redundancia.

### Capa 0 — Convención de nombres (la base de todo lo demás)

**Tag obligatorio en TODO recurso creado por tests:**

```
[QA-AUTO][run=<runId:6>][w=<worker>] <Tipo> <test-title-slug> <iso-timestamp>
```

Ejemplos reales:
- `[QA-AUTO][run=a3f1c2][w=1] Live audio-filter @LIVE-TC-18 2026-07-09T14:00:23Z`
- `[QA-AUTO][run=a3f1c2][w=2] Media transcoded probe @MED-TC-001 2026-07-09T14:00:24Z`

Componentes:
- `[QA-AUTO]` — prefijo compartido (sin cambios)
- `[run=<6-hex>]` — random por **corrida** (todos los workers de un run comparten)
- `[w=<n>]` — workerId dentro del run
- `<Tipo>` — Live / Media / Ad / Schedule / Clip / Logo / Caption / etc.
- `<test-title-slug>` — kebab-case del título del test, máx 60 chars
- `<iso-timestamp>` — `Date.now()` solo si hay ambigüedad residual

**Por qué `runId`:** habilita el sweep global (capa 4) y la correlación entre
recursos creados por la misma corrida en logs/reportes.

**Implementación:**
- Generar `runId` en `globalSetup` (6 hex de `crypto.randomBytes(3).toString('hex')`).
- Inyectarlo via `process.env.QA_RUN_ID` y leerlo en factories/fixtures.
- Helper único `qaName(parts)` en `src/utils/qa-name.js` para evitar drift.

### Capa 1 — Fixtures per-test + ResourceCleaner (lo que ya hay)

Mantener el patrón actual **sin cambios estructurales**:
- Cada fixture crea por API y registra en un `ResourceCleaner` per-test.
- Teardown llama `cleaner.clean()` (best-effort, 3 pases).
- 404 se trata como éxito (ya idempotente).

Mejora concreta:
- `ResourceCleaner` debe llevar `runId` en el log de cada delete (para filtrar
  el reporte final por run).

### Capa 2 — ResourceRegistry global (el "trackeo total" del proceso)

Singleton por proceso (`globalThis.__qaRegistry__` o un módulo con estado):

```js
// src/fixtures/resource-registry.js
const DELETERS = { /* mismo mapa que ResourceCleaner */ };

class ResourceRegistry {
  constructor() {
    /** @type {Map<string, {type:string,id:string,testId?:string,t:number}>} */
    this.created = new Map();
    this.deleted = new Map();
  }

  register(type, id, meta = {}) {
    const key = `${type}:${id}`;
    this.created.set(key, { type, id, ...meta, t: Date.now() });
  }

  markDeleted(type, id) {
    const key = `${type}:${id}`;
    if (this.created.has(key)) {
      const c = this.created.get(key);
      this.deleted.set(key, { ...c, deletedAt: Date.now() });
      this.created.delete(key);
    }
  }

  /** Lo que quedó al final (no borrado). */
  leaked() {
    return [...this.created.values()];
  }
}

module.exports = { ResourceRegistry };
```

- `ResourceCleaner` notifica al registry en `register` y en cada delete OK.
- Una vez por run (en teardown), `registry.leaked()` se serializa a
  `reports/leaks-<runId>.json` para auditoría.

### Capa 3 — Tracking automático (sin `register()` manual)

**Objetivo:** eliminar el riesgo de olvidar `register()`.

Estrategia: **decorar** los clients API en el fixture (`src/fixtures/index.js`):

```js
// Envolver cada método POST/PUT/DELETE de los clients para que, según el path
// (regex), se auto-registre en el registry global.

const TRACK_PATTERNS = [
  { regex: /^\/api\/live-stream\/[^/]+$/,         type: 'live-stream', methods: ['POST', 'PUT'] },
  { regex: /^\/api\/live-stream\/[^/]+\/schedule-job\/[^/]+$/, type: 'schedule', methods: ['POST', 'PUT', 'DELETE'] },
  { regex: /^\/api\/media\/[^/]+$/,              type: 'media',      methods: ['POST', 'PUT'] },
  { regex: /^\/api\/ad\/[^/]+$/,                 type: 'ad',         methods: ['POST', 'PUT'] },
  { regex: /^\/api\/playlist\/[^/]+$/,           type: 'playlist',   methods: ['POST', 'PUT'] },
];
```

Una llamada `POST /api/live-stream/` con body que matchea la convención de
nombre Capa 0 se auto-registra como `live-stream:<id>`. Si el recurso no es
trazable (path desconocido o body sin tag QA), el spec debe usar `register()`
explícito — eso lo vuelve un **smell localizable** en code review.

**Alternativa más simple (MVP):** no decorar, sino exponer un helper:

```js
// src/utils/qa-create.js
async function qaCreate(cleaner, factoryFn, opts) {
  const id = await factoryFn(opts);
  cleaner.register(opts.__type, id);  // type explícito
  return id;
}
```

Migración progresiva: tests nuevos usan `qaCreate`. Tests viejos siguen con
`register()` manual. Sin romper nada.

### Capa 4 — Safety net global (globalTeardown)

Script `src/fixtures/global-teardown.js` registrado en `playwright.config.js`:

```js
// globalTeardown: barre [QA-AUTO]* que NO estén lockeados en el registry.
// Usa una regex de nombre (Capa 0) y los endpoints LIST+DELETE ya existentes.
```

Algoritmo:
1. Esperar 2s (deja que los teardown per-test terminen).
2. Listar todos los recursos del entorno que matchean `[QA-AUTO][run=<runId>]`.
3. Para cada uno: DELETE best-effort con retry exponencial (3 intentos).
4. Escribir reporte `reports/cleanup-<runId>.json`:
   `{ created, deleted, leaked, errors: [...] }`.
5. **Skip total si `env.isProd`**.

Útil cuando un worker crashea (OOM, kill -9, network partition): sin esto, esos
recursos quedan huérfanos para siempre.

### Capa 5 — Pre-flight check (globalSetup)

Antes de la corrida:

1. Contar `[QA-AUTO]*` actuales en el entorno (un GET por cada tipo conocido).
2. Si supera el umbral `QA_LEAK_THRESHOLD` (env var, default 50):
   - **No fail** (puede ser ruido legítimo).
   - Log warning + ofrecer sweep opcional (`QA_PREFLIGHT_CLEAN=true` lo activa).
3. Si `QA_PREFLIGHT_CLEAN=true`: sweep de cualquier `[QA-AUTO][run=<oldRunId>]`
   donde `oldRunId != currentRunId`. Huérfanos históricos.

**Beneficio:** detecta degradación gradual del ambiente antes de que rompa una
corrida.

### Capa 6 — Cascade-aware cleanup

`DELETERS` hoy solo borra el padre. Si el padre tiene hijos en un orden
inesperado (e.g., un ad con insertions + referrers + schedule), el DELETE puede
fallar con "tiene hijos" → 4xx → re-queue infinito hasta los 3 pases.

Mejora: **DELETERS encadenados** por tipo. Para `live-stream`, antes del
DELETE principal, intentar:
1. `DELETE /api/live-stream/:id/schedule-job/:sid` por cada schedule del live.
2. `DELETE /api/live-stream/:id/recording/:rid` por cada recording.
3. (Si los hijos están en `DELETERS`, el registry ya los tiene.)

Si el server hace cascade nativo (verificado para live-stream→schedule:
LIVE-TC-14), no hace falta — pero **verificar** antes de cada deploy (un cambio
en el server puede romper el cascade sin que los tests lo detecten).

### Capa 7 — Rate-limit dev (semáforo por tipo)

`dev.platform.mediastre.am` es compartido. N workers × 4 proyectos = hasta
~20 POSTs simultáneos. Evidencia: 502 Bad Gateway en este run.

Implementación:
- **Semáforo** en `src/utils/semaphore.js`: map `type → {permits, inflight}`.
- Wrap del create en cada factory: `await sem.withPermit('live-stream', () => createLiveStream(...))`.
- Default: 4 permits concurrentes por tipo (configurable via `QA_MAX_CONCURRENT_CREATE`).
- **No es un test más**: es infra del framework. Beneficio: -50% de 502s.

### Capa 8 — Observabilidad y métricas

Cada create/delete loguea:
```
[QA-CREATE] run=a3f1c2 w=1 type=live-stream id=6a4f... test="audio: el schedule..." t=423ms
[QA-DELETE] run=a3f1c2 w=1 type=live-stream id=6a4f... t=87ms
[QA-LEAK]   run=a3f1c2 w=1 type=live-stream id=6a4f... test=...  reason=worker-crash
```

Al final del run (en teardown):
- `reports/provisioning-<runId>.json`:
  ```json
  {
    "runId": "a3f1c2",
    "created": 47,
    "deleted": 46,
    "leaked": 1,
    "by_type": { "live-stream": { "created": 12, "deleted": 12, "leaked": 0 } },
    "duration_ms": { "create_p50": 420, "delete_p50": 80 }
  }
  ```
- Si `leaked > 0`: warning visible en CI, **no fail** (best-effort).

## Convenciones

| Concepto | Convención |
|---|---|
| Prefijo de nombre | `[QA-AUTO][run=<6-hex>][w=<n>]` |
| runId | `crypto.randomBytes(3).toString('hex')`, generado en `globalSetup` |
| Helper único de naming | `src/utils/qa-name.js → qaName(parts)` |
| Thresholds | `QA_LEAK_THRESHOLD` (default 50), `QA_MAX_CONCURRENT_CREATE` (default 4) |
| Modo dry-run | `QA_DRY_RUN=true` — loguea pero no crea |
| Skip en prod | `if (env.isProd) test.skip(...)` en beforeEach (ya patrón actual) |

## Anti-patrones (lo que NO se debe hacer)

1. **Reusar un recurso de otro autor** (live, media, ad) para escribir/leer
   encima: rompe el self-contained y depende de su ciclo de vida.
2. **Asumir cascade del server sin verificar**: cada módulo declara en su
   `overview.md` qué cascade se verificó. Sin cascade → cleanup manual de hijos.
3. **Hardcodear IDs en el spec**: usar siempre el id del fixture. Si hace falta
   uno específico, derivarlo por API (`GET list → filter → pick`).
4. **`test.skip()` + crear recurso igual**: el fixture es lazy, pero el factory
   dentro del test no. Si el test crea sin skip, lo crea aunque se skipee.
   Mover el create DENTRO del `test()` body, no en `beforeAll`.
5. **Naming sin tag QA** (`My Live Test`): el sweep global (Capa 4) no lo
   puede distinguir de un live humano. **Bloquea el code review** (lint rule).
6. **Borrado parcial** ("borro solo el live pero dejo el schedule"):
   si el server NO hace cascade, esto es leak garantizado. Verificar con
   `LIVE-TC-14` equivalente por módulo.
7. **`register()` sin `clean()`**: registrar sin teardown es lo mismo que no
   registrar. Code review debe exigir simetría.

## Plan de implementación (Fases)

| Fase | Capa | Entregable | Esfuerzo | Impacto | Status |
|---|---|---|---|---|---|
| **F1** | C0 | Capa 0 (naming) + `qaName()` helper + refactor de fixtures/factories para usarlo | 1 sesión | habilitador de C2/C4 | ✅ commit `bdc9110` |
| **F2** | C2 | Capa 2 (ResourceRegistry) + integración con `ResourceCleaner` | 0.5 sesión | observabilidad | ✅ commit `<f2>` |
| **F3** | C4 | Capa 4 (`globalTeardown` sweep por `[QA-AUTO][run=<id>]`) | 1 sesión | safety net real | ✅ commit `7d3830c` |
| **F4** | C7 | Capa 7 (semáforo por tipo) | 0.5 sesión | mata los 502 del dev | ✅ commit `f82cdc1` |
| **F5** | C3 | Capa 3 (auto-tracking o `qaCreate`) — elegir una | 1 sesión | elimina `register()` manual | pendiente |
| **F6** | C5+C8 | Capa 5 (pre-flight) + Capa 8 (métricas en reporte) | 1 sesión | observabilidad histórica | parcial: provisioning report ya generado |
| **F7** | C6 | Capa 6 (cascade-aware DELETERS) — para módulos con hijos no cascade | según módulo | completa la cobertura | pendiente |

> **Nota sobre los identificadores de commit:** los hashes listados arriba son
> los commits que implementaron cada fase. Reemplazar por los reales del repo
> si esta sección se regenera.

Costo total: ~5 sesiones para tener las 7 capas activas. Cada fase es
**independiente**: se puede parar en cualquiera y seguir con valor.

### Estado actual (post-F2)

| Capa | Estado |
|---|---|
| C0 — naming convention | ✅ activo, usado por 4 fixtures + 3 factories |
| C1 — per-test ResourceCleaner | ✅ pre-existente, ahora notifica al ResourceRegistry |
| **C2 — ResourceRegistry global** | ✅ activo, `flush()` por test, snapshot per-worker en `reports/provisioning-w<id>-<runId>.json`, agregado en `reports/provisioning-<runId>.json` |
| C3 — auto-tracking / `qaCreate` | ⏳ pendiente |
| **C4 — globalTeardown sweep** | ✅ activo, escribe `reports/cleanup-<runId>.json` |
| C5 — pre-flight check | ⏳ pendiente |
| C6 — cascade-aware DELETERS | ⏳ pendiente (LIVE → schedule ya cascade) |
| **C7 — semáforo por tipo** | ✅ activo en `createLiveStream`, opt-in via `QA_MAX_CONCURRENT_CREATE` |
| **C8 — métricas en reporte** | ✅ provisioning report con created/deleted/leaked por tipo, p50/p95 de duraciones, per-worker |

## Criterios de éxito (SLAs)

| Métrica | Objetivo | Cómo medir |
|---|---|---|
| Huérfanos por run | `<= 1` | `reports/cleanup-<runId>.json` |
| Tiempo de teardown por test | `< 500ms p50` | logs `[QA-DELETE]` |
| Falsos positivos de flake por infra | `< 5%` | flakes por 502/timeout en `results.json` |
| Cobertura de DELETERS | `= 100%` de tipos creados | audit: scan de fixtures vs DELETERS table |

Cuando `huérfanos = 0` y `flakies < 5%` consistentemente, el módulo está
"sealed" para self-contained.

## Cómo extender a un nuevo módulo

Checklist al crear un fixture nuevo:

- [ ] Factory expone `createXxx(api, opts)` que devuelve `id`.
- [ ] Factory usa `qaName({ type: 'Xxx', testTitle })` para el nombre.
- [ ] Existe deleter en `DELETERS` (`src/fixtures/resource-cleaner.js`) que
      llama `DELETE /api/xxx/:id`.
- [ ] Si el recurso tiene hijos no cascade: deleter compuesto (borra hijos
      primero, luego padre). Documentar en `modules/<m>/overview.md`.
- [ ] Si la creación requiere polling (gate async como transcoding): factory
      espera al gate y devuelve id ya listo.
- [ ] Spec usa fixture o `qaCreate(cleaner, createXxx, ...)`; nunca el
      client crudo sin registrar.
- [ ] Antes de mergear: ejecutar contra dev con `QA_DRY_RUN=false` y leer
      `reports/cleanup-<runId>.json` para confirmar leak=0.

## Referencias

- `src/fixtures/resource-cleaner.js` — cleaner best-effort
- `src/fixtures/index.js` — fixtures (`liveStream`, `audioLiveStream`, etc.)
- `src/api/{live-stream,media,ads}-factory.js` — factories de creación
- `tests/api/resource-cleaner.api.spec.js` — LIVE-TC-14: prueba del cleaner
- `knowledge-core/modules/live-stream/overview.md` — ejemplo de cascade
  verificada (`live-stream → schedule`)
- `CLAUDE.md` § Entorno y sesión — storageState y `.auth/`