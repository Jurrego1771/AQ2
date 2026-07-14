---
name: qa-report
description: >
  Generar un informe HTML de evidencias de una sesión de QA (exploración en vivo o corrida
  de tests): qué se probó, qué pasó/falló, hallazgos con capturas y recomendaciones, con
  estilo visual agradable y un solo archivo portable. Úsalo al CERRAR una sesión de
  exploración (p.ej. tras /qa-module) o tras correr la suite. Invocación: /qa-report
  [<carpeta-de-evidencia>] (ej: reports/live-editor/audio-2026-06-26).
---

# qa-report — informe HTML de evidencias

Convierte una sesión de QA en **un solo HTML autocontenido** (estilos embebidos + imágenes
en base64) que muestra: resumen con conteos, qué se probó (y qué NO), tabla de tests
(passed/failed/rojo-esperado/skipped), hallazgos con severidad y capturas, recomendaciones,
galería de evidencias y logs colapsables. Corre en el hilo principal; honra `CLAUDE.md`.

El argumento (opcional) es la **carpeta de evidencia** (`$ARGUMENTS`). Si falta, usa o crea
`reports/<modulo>/<flujo>-<fecha>/` y pregunta lo mínimo necesario.

## Piezas (junto a este archivo)
- `scripts/generate-report.js` — generador Node **sin dependencias**.
- `templates/report.css` — estilos (editable sin tocar el JS).
- `manifest.example.json` — esquema del manifiesto de entrada (cópialo y rellénalo).

## Procedimiento

### P0 — Reunir la evidencia
1. Define/crea la carpeta de evidencia `reports/<modulo>/<flujo>-<YYYY-MM-DD>/` con un
   subdirectorio `img/` (capturas) y, si aplica, `logs/`.
2. **Capturas:** durante la exploración con Playwright MCP usa `browser_take_screenshot`
   con nombres descriptivos (`<modulo>-NN-<que-muestra>.png`) en los momentos clave
   (estado inicial, acción, resultado/evidencia del hallazgo). Muévelas a `img/`.
3. **Logs:** guarda en `logs/` lo relevante (respuesta de red, consola filtrada). En el
   manifiesto un log puede ir inline (`content`) o por archivo (`file`).
4. **Resultados de tests:** si hubo corrida automatizada, genera el JSON de Playwright
   (`PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test ... --reporter=json`)
   para fusionarlo; si fue exploración manual, declara los casos a mano en `tests`.

### P1 — Escribir el manifiesto
Crea `report.json` en la carpeta de evidencia copiando `manifest.example.json`. Reglas:
- `meta`: title, subtitle, module, environment, date, tester.
- `scope`: lista de qué se probó (los flujos recorridos).
- `tests[]`: `{ id, title, layer, status, evidence[], notes }`. `status` ∈
  `passed | failed | xfail (rojo-esperado) | skipped`. Las rutas de `evidence` son
  **relativas al manifiesto**.
- `findings[]`: `{ id, url, title, severity, type, description, evidence[], recommendation }`.
  `severity` ∈ `critical | high | medium | low | info`. Enlaza el issue real de GitHub
  (`Jurrego1771/AQ2#N`). **No inflar severidad** (CLAUDE.md — honestidad de QA).
- `coverageGaps[]`: `{ id, area, why, mitigation }`. Lo que la suite **NO cubre**:
  huecos por scope, dependencias de entorno, datos no disponibles, endpoints sin
  automatización, rutas que requieren scheduler o fixtures externos. **Importante**:
  sin esta sección el informe miente al sugerir cobertura total.
- `recommendations[]`: acciones priorizadas.
- `evidence[]`: galería — `{ file, caption }`.
- `logs[]`: `{ label, content }` o `{ label, file }`.
- Los textos admiten markdown-lite: `**negrita**`, `` `code` ``, enlaces y saltos de línea.

> Honestidad: el informe refleja lo verificado. Tests que no se corrieron → no se listan
> como passed. Hallazgos no confirmados → no se incluyen. Balancea con lo que funciona.
> **Suite incompleta → declarar huecos en `coverageGaps[]`, no esconderlos.** El informe
> tiene que servir para defender (o cuestionar) la cobertura real, no para aparentarla.

### P2 — Generar el HTML
```
node .claude/skills/qa-report/scripts/generate-report.js <carpeta>/report.json
# opciones:
#   --out <archivo.html>      (default: informe.html junto al manifiesto)
#   --playwright results.json (fusiona estados reales por @<PFX>-TC-N del título)
#   --no-embed                (enlaza imágenes en vez de base64; HTML no portable)
#   --css <archivo.css>       (hoja de estilos alternativa)
```
El generador deriva los conteos del resumen desde `tests[]`. Con `--playwright`, los casos
del manifiesto se cruzan por `id` con los specs (tag `@<PFX>-TC-N`): Playwright aporta el
**estado real** y el manifiesto el título/evidencia; specs corridos no declarados se anexan.

### P3 — Verificar y cerrar
1. Abre el HTML y revisa: conteos correctos, capturas visibles (lightbox al click), badges
   y severidades bien, enlaces a issues funcionando.
2. Reporta al usuario la ruta del informe y el desglose (passed/failed/rojo-esperado).
3. **Commit:** el HTML autocontenido + `report.json` + `img/` van a `reports/`. DETENTE y
   pide confirmación antes de `git commit`/`git push` (CLAUDE.md).

## Qué NO hace
No corre los tests ni explora por sí mismo (eso es `qa-module` / la suite). No publica el
informe en ningún servicio externo. No deriva estado de ejecución a `knowledge-core` (eso es
la Fase 3 diferida del build).
