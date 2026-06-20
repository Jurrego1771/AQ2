# Plan de Implementación: Knowledge Core (Risk-Based, file-first, escalable)

## Objetivo

Conectar **riesgos → tests → historias/AC** con trazabilidad real, **sin sobre-ingeniería**.
El grafo, los embeddings y la capa de IA del ERD objetivo son la **visión (north-star)**, NO lo que
se construye hoy. Hoy se realiza esa visión con artefactos ligeros que ya producimos.

---

## Principio rector: Definición vs Derivado

| Capa | Qué es | Dónde vive | Quién la escribe |
|------|--------|------------|------------------|
| **Definición** | Lo que *debería* ser: historias, AC, riesgos, metadatos de test | YAML en `knowledge-core/` | A mano (humano/agente) — **fuente de verdad** |
| **Derivado** | Lo que *pasó*: ejecuciones, resultados, artefactos, cobertura | Playwright report + `dist/` | **Generado por script — nunca a mano** |

> Regla de oro: **la definición no contiene estado de ejecución.** Si un campo cambia solo al correr
> los tests, no va en el YAML.

---

## Qué NO hacemos ahora (deuda que evitamos a propósito)
- ❌ Base de datos / grafo persistente
- ❌ Embeddings / vector store (Qdrant)
- ❌ Scoring ML de riesgo, priorización automática
- ❌ Root-cause analysis automático
- ❌ Ingestión de observabilidad (Datadog) al modelo

Todo esto es **Fase 5 condicional**: se activa solo con volumen y un dolor concreto (ver *Disparadores*).

---

## Modelo mínimo (mapea 1:1 al ERD objetivo)

Cada registro YAML está diseñado para ser **una fila/nodo del futuro grafo**. Migrar luego es una
*compilación*, no un rediseño.

| Entidad del ERD | Realización HOY | Autoría |
|-----------------|-----------------|---------|
| `USER_STORY` / `ACCEPTANCE_CRITERION` | `epics/[epic]/historias.yaml` | manual |
| `RISK_SIGNAL` | `modules/[modulo]/riesgos.yaml` | manual |
| `TEST_CASE` (definición) | `modules/[modulo]/tests.yaml` (sin campos de ejecución) | manual |
| `TEST_EXECUTION` / `TEST_RESULT` / `ARTIFACT` / `OBSERVABILITY_TRACE` | Playwright report (`results.json`, traces, video) | **generado** |
| `BUG` | **GitHub issue** (`Jurrego1771/AQ2#N`) | externo — solo se referencia |
| `ENVIRONMENT` | `src/utils/env.js` (dev/qa/prod) | config |
| `DOMAIN_ENTITY` | refs a archivos sm2 + marcas `sm:` | manual ligero |
| `QA_KNOWLEDGE_NODE` / `ROOT_CAUSE` / `TEST_PRIORITIZATION` / embeddings | **DIFERIDO** (Fase 5) | — |

---

## El puente: tags en el título del spec
Cada test Playwright lleva sus IDs en el título — es el *join* entre la definición (YAML) y la
ejecución (runner):

```js
test('busca por título y filtra el listado @MED-TC-001 @AC-3 @MED-RISK-002 @US-005 @regression', ...)
```

Sin tag, un test es invisible para la trazabilidad. Un test verifica el AC, mitiga el riesgo, sirve la historia.

---

## La costura de escalabilidad: compilar a `knowledge.json`
Aquí está el valor del "grafo" **sin** base de datos. Dos scripts:

- **`scripts/build-knowledge.js`** → lee YAML + último `results.json` de Playwright + issues (`gh`)
  y emite:
  - `knowledge-core/dist/knowledge.json` — grafo denormalizado (read model) listo para consultar.
  - `knowledge-core/dist/COVERAGE.md` — cobertura por módulo/riesgo/AC.
- **`scripts/check-traceability.js`** → valida la cadena y rompe el build si hay orphans
  (reemplaza el checklist manual).

> Este `build` es exactamente el punto donde, **si algún día hace falta**, se cambia el backing store
> (JSON → SQLite → Postgres/grafo/Qdrant) **sin tocar la autoría en YAML ni los specs**. Esa es la
> arquitectura que escala: hoy un script de 100 líneas, mañana un servicio, misma fuente de verdad.

---

## Fases

### Fase 1 — Estructura base ✓ (con un ajuste)
Hecho: `base/{riesgo,test,historia-usuario}.yaml`.
**AJUSTE pendiente:** quitar de `base/test.yaml` los campos `ultima_ejecucion` y `resultado`
(son *derivados* → vienen del report, no del YAML). El estado del test se calcula en el build.

### Fase 2 — Módulo piloto: `media`
1. Poblar `modules/media/{riesgos,tests}.yaml` + `epics/.../historias.yaml`.
2. **Taggear los specs que YA existen** (`tests/smoke/*`, `tests/regression/media-search.*`) con sus IDs.
3. Referenciar los hallazgos reales como `defectos_relacionados` → issues **#1–#10** de GitHub.
**Entregable:** un módulo conectado, anclado a tests reales y bugs reales (no inventados).

### Fase 3 — Automatizar la trazabilidad
Implementar `build-knowledge.js` + `check-traceability.js`. Correrlos en CI.
Checklist (ahora automatizado): cada AC ≥1 test · cada test mitiga ≥1 riesgo · cada riesgo MUST ≥1 test ·
cada test tiene `spec` existente + tag · 0 orphans.

### Fase 4 — Escalar por módulo
Repetir Fase 2 con el mismo patrón. IDs secuenciales y **estables** por módulo (prefijo: MED, etc.).

### Fase 5 — Promover a grafo/IA (CONDICIONAL)
Solo si los *disparadores* se cumplen. Migrar `knowledge.json` al store que aplique e introducir
`QA_KNOWLEDGE_NODE`/embeddings/RCA. No antes.

---

## Disparadores de evolución (cuándo escalar, no "si")
- **A grafo/DB:** consultar relaciones sobre `knowledge.json` se vuelve lento, o > ~15 módulos.
- **A embeddings/RAG:** hay un corpus grande y la búsqueda por tag/keyword ya no alcanza.
- **A RCA / priorización ML:** existe histórico de ejecuciones suficiente para que el modelo aporte.

---

## Reglas
1. **Definición ≠ ejecución** — el YAML no guarda resultados/fechas de corrida.
2. **IDs estables** — son las claves foráneas del futuro grafo; nunca reusar ni renombrar.
3. **Sin duplicación** — cada elemento existe en un solo lugar; el resto lo referencia por ID.
4. **BUG vive en GitHub** — aquí solo se referencia (`repo#N`).
5. **Un test = un tag con su ID** — sin tag, no existe para la trazabilidad.
6. **Guerra al YAML** — solo campos que un script consuma o un humano lea para decidir.

---

## Métricas de éxito (medibles por `build`)
- % de AC con ≥1 test automatizado.
- % de riesgos `MUST` con test asociado.
- **0 orphans** en cada build (gate de CI).
- Onboarding de un módulo nuevo: < 1 día.
