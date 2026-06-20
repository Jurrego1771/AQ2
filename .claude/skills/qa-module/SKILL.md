---
name: qa-module
description: >
  Explorar y construir cobertura QA de un módulo del admin SM2 (AQ2). Úsalo cuando el usuario
  quiera iniciar/extender un módulo: exploración en vivo con Playwright MCP, reporte de bugs a
  GitHub, escritura de specs (verdes + test.fail vivos) y poblado del knowledge-core. Invocación:
  /qa-module <nombre-del-módulo> (ej: media, live-stream, customer).
---

# qa-module — flujo canónico de exploración + cobertura

Procedimiento interactivo (corre en el hilo principal: el usuario ve el navegador y discute
hallazgos). Honra siempre `CLAUDE.md`. Carga `heuristicas.md` (junto a este archivo) antes de F1.

El argumento es el nombre del módulo (`$ARGUMENTS`). Si falta, pregúntalo.

---

## F0 — Consultar (LEER antes de actuar)
1. Lee, si existen: `knowledge-core/modules/<m>/{riesgos,tests}.yaml` y
   `knowledge-core/epics/*/historias.yaml`. Inventaría US/AC/RISK/TC ya presentes.
2. Determina el **prefijo** del módulo (media=MED) y el **siguiente ID libre** de cada tipo
   (`US-N`, `<PFX>-AC-N`, `<PFX>-RISK-N`, `<PFX>-TC-N`). Si el módulo es nuevo, elige PFX (3-4
   letras) y arranca en N=1 (US-N sigue la secuencia global).
3. Lee `knowledge-core/base/{historia-usuario,riesgo,test}.yaml` como esquema de salida.
4. Lee `heuristicas.md`.
5. (Opcional, contexto ligero) Ojea rutas/vistas del repo fuente SM2 si está disponible
   (`SM2_LOCAL_REPO`). **La verdad es el entorno vivo**, no el `.coffee`.

Reporta al usuario qué ya existe y qué IDs vas a usar **antes** de explorar.

## F1 — Explorar en vivo (Playwright MCP)
1. `browser_navigate` al BASE_URL del módulo; asegura sesión (storageState). Si pide login, deténte.
2. Por cada página/flujo clave: `browser_snapshot` + **cosecha de marcas** con `browser_evaluate`
   (`querySelectorAll('[sm]')` dedup; ver snippet en `heuristicas.md`). Estas marcas son el contrato
   de selectores para el POM.
3. Recorre los flujos principales del módulo con tecleo/click reales (no solo eventos sintéticos).
4. Captura `browser_network_requests` y `browser_console_messages` para hallazgos de perf/fiabilidad.
5. Aplica el checklist de `heuristicas.md` (Nielsen, a11y, perf, seguridad-smoke).
6. **VERIFICA cada sospecha** antes de darla por bug (descarta falsos positivos). Anota también lo
   que funciona bien.

## F2 — Reportar bugs (AUTOMÁTICO)
Por cada hallazgo **verificado**, `gh issue create` con:
- labels: `qa-finding` + tipo (`bug`/`ux`/`accessibility`/`performance`/`tech-debt`) + severidad
  (`severity:medium`/`severity:low`; crea el label si falta con `gh label create`).
- cuerpo: resumen, pasos de reproducción, evidencia (conteos/URL/red/consola), expected, ref a código
  sm2 si aplica, heurística/estándar violado. Sin inflar severidad.
Guarda el número de issue para enlazarlo en specs y knowledge-core.

## F3 — Codificar specs
1. Extiende/crea `src/pages/<m>.page.js` SOLO con `sm()`/`smPrefix()` reales (cosechados en F1).
   Marcas async/colección → `:visible`. Acciones simples; el wait/assert va en el spec con `expect.poll`.
2. Escribe specs en `tests/regression/` (o `tests/smoke/`):
   - **VERDES** para el comportamiento correcto (a proteger).
   - **`test.fail(true, '... #N')`** como prueba viva por cada issue filado en F2.
   - Título con `@<PFX>-TC-N` + capa. Deriva datos del entorno (no hardcodear títulos/ids).
3. Corre `npx playwright test --project=regression <archivo>` hasta verde / rojo-esperado. Si hay
   flakiness, robustece con `expect.poll`, no con sleeps.

## F4 — Poblar knowledge-core (Definición, no Derivado)
- `epics/<epic>/historias.yaml`: **WRITE** US + AC (solo `id` + `criterio`) de los flujos
  **explorados**. Una US por flujo significativo. Sin reverse-links.
- `modules/<m>/riesgos.yaml`: un riesgo por hallazgo, con `severidad`, `probabilidad`, `detonador`,
  `mitigacion`, `archivos_afectados`, `defectos_relacionados: [Jurrego1771/AQ2#N]`, `prioridad_prueba`.
  **NO** `mitigado_por_test` (derivado).
- `modules/<m>/tests.yaml`: un entry por test con `refs` como **fuente única**
  (`validates: [<PFX>-AC-N]`, `mitigates: [<PFX>-RISK-N]`, `story: US-N`, `spec`).

## F5 — Cerrar
1. Resume: hallazgos (con # de issue), tests añadidos (verdes/vivos), cobertura del módulo, GAPs
   (riesgos sin test).
2. **DETENTE y pide confirmación antes de `git commit`/`git push`.** Tras aprobación: branch si no
   estás en una de trabajo, commit con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`, push.

---

## Regla consultar-vs-escribir historias
- **Consultar** (F0): historias/AC/tests/riesgos existentes — para no duplicar IDs/AC y hallar el
  siguiente libre.
- **Escribir** (F4): solo historias de flujos que **exploraste**; una US por flujo significativo;
  AC = `id` + `criterio` (intención medible).
- **No escribir**: reverse-links, estado de ejecución, `mitigado_por_test`, ni historias para
  micro-interacciones o flujos no explorados.

## Qué NO hace este skill
Subagentes autónomos, pipeline de 8 agentes, `inbox/`, ni los scripts de Fase 3
(`build-knowledge.js` / `check-traceability.js`) — diferidos hasta tener volumen.
