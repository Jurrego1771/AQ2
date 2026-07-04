---
name: pr-context
description: >
  Analiza un PR (o issue) de un repo fuente (ej. mediastream/sm2) y devuelve un resumen
  estructurado: qué fallaba, causa raíz, cómo se arregló, archivos modificados, e info accionable
  para escribir/seleccionar tests. Solo lectura: no explora en vivo ni escribe specs — eso lo
  decide el usuario después. Invocación: /pr-context <url-del-PR> [comentario/contexto del bug].
---

# pr-context — resumen estructurado de un PR para QA

Procedimiento de **solo lectura y análisis** (corre en el hilo principal, no delega a subagentes).
No navega el sitio en vivo con Playwright ni escribe specs — el output es un insumo para que el
usuario decida qué testear después (a mano o con `/qa-module`).

## Entrada
`$ARGUMENTS` = URL del PR (obligatorio) + opcionalmente un comentario/contexto del reporte
original (texto libre: el bug reportado por cliente/QA, un issue linkeado, notas de quien pide el
análisis). Si falta la URL, pedila antes de seguir.

## Procedimiento

1. **Traer el PR**: `gh pr view <url> --json title,body,state,files,url,baseRefName,headRefName,mergedAt`.
   Si el título, el body o el nombre de la branch referencian un issue (ej. `fix/issue-XXXX`,
   "Fixes #XXXX"), traelo también con `gh issue view`.
2. **Traer el diff completo**: `gh pr diff <url>`. Leelo entero antes de resumir — no te quedes
   con solo los nombres de archivo ni con el resumen que da `--json files`.
3. **Analizar el diff**, no listarlo. Ignorá cambios mecánicos (bump de versión, lockfiles,
   formateo). Para cada cambio funcional, identificá:
   - Qué comportamiento roto/incorrecto existía antes (la falla, en términos observables).
   - La causa raíz técnica exacta (qué línea/lógica la producía).
   - Qué cambia el fix (el mecanismo, no un genérico "se corrigió X").
   - Si hay más de un cambio bundleado en el mismo PR (ej. un fix del lado cliente + una guarda
     defensiva del lado servidor), señalá cada uno por separado — no los mezcles en una frase.
4. **No asumir el estado real a partir del estado del PR en GitHub.** Que un PR figure sin
   mergear no significa que el fix no esté desplegado (puede haberse promovido por otra vía), y
   que figure mergeado no confirma que ya esté en el ambiente que le importa al usuario (dev/qa/
   prod pueden estar en versiones distintas). Este skill NO verifica eso en vivo — decilo
   explícitamente en la salida como pendiente de confirmar explorando.
5. **Extraer info accionable para tests** — la parte más importante para quien recibe el resumen.
   Por cada cambio relevante, pensá en concreto:
   - Parámetros de query/API cuyo comportamiento cambia (ej. `?all=true`).
   - Condiciones de datos necesarias para reproducir la falla (ej. "requiere un registro con
     status DELETE compartiendo algún campo con uno activo").
   - Casos límite que el fix introduce o cierra (guardas nuevas, validaciones, edge cases).
   - Qué parte se puede verificar por API (rápido, determinístico) vs. qué requiere UI.
   - Si el repo de destino (AQ2) ya tiene cobertura relacionada: buscá en
     `knowledge-core/modules/*/tests.yaml` y `riesgos.yaml` por el área tocada, y decilo (no
     dupliques contexto que ya existe).

## Salida (formato fijo)

Devolvé siempre esta estructura. Si una sección no aplica, decilo explícitamente — no la omitas
en silencio.

```
## <Título corto de la falla>

**PR**: <url> — <mergeado a <branch> | abierto sin mergear, branch <head> -> <base>>
**Issue relacionado**: <url o "ninguno">

### Qué fallaba
<1-3 frases, en términos de comportamiento observable, no de código>

### Causa raíz
<explicación técnica, con el archivo/línea relevante>

### Cómo se arregló
<un bullet por cada cambio funcional no trivial: archivo -> qué hace exactamente>

### Archivos modificados
<lista, con 1 línea de qué toca cada uno (o "ver arriba" si ya se detalló)>

### Info para tests
<bullets accionables: condición de datos/API necesaria para reproducir, qué se puede testear por
API vs UI, casos límite, cobertura ya existente en el knowledge-core si aplica>

### Sin verificar / a confirmar
<qué de todo esto no se confirmó en vivo y por qué>
```

## Qué NO hace este skill
No navega el sitio en vivo (Playwright MCP), no corre ni escribe tests, no toca el
knowledge-core, no delega a subagentes/workflows. Es puro análisis del PR — el siguiente paso
(explorar en vivo, elegir qué testear, escribir specs) lo decide el usuario, típicamente
siguiendo con `/qa-module`.
