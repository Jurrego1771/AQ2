---
name: pr-context
description: >
  Analiza un PR (o issue) de un repo fuente (ej. mediastream/sm2) y devuelve un resumen
  estructurado: qué fallaba, causa raíz, cómo se arregló, archivos modificados, e info accionable
  para escribir/seleccionar tests. Persiste SIEMPRE el resultado en
  `reports/pr-context/YYYY-MM-DD-pr-<NUM>-<slug>.json` (mismo path, misma nomenclatura).
  No navega en vivo ni escribe specs — eso lo decide el usuario después. Invocación:
  /pr-context <url-del-PR> [comentario/contexto del bug].
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
3. **Traer las conversaciones del PR**: `gh pr view <url> --comments` (filtrá los comentarios
   humanos de los code-review-bot). Para cada comentario humano, registrá autor, estado y
   mensaje. Tratá con pinzas: lo que dice un revisor puede no ser verdad (versus el diff), pero
   es una buena fuente de casos de prueba que el rev no verificó en vivo.
4. **Analizar el diff**, no listarlo. Ignorá cambios mecánicos (bump de versión, lockfiles,
   formateo). Para cada cambio funcional, identificá:
   - Qué comportamiento roto/incorrecto existía antes (la falla, en términos observables).
   - La causa raíz técnica exacta (qué línea/lógica la producía).
   - Qué cambia el fix (el mecanismo, no un genérico "se corrigió X").
   - Si hay más de un cambio bundleado en el mismo PR (ej. un fix del lado cliente + una guarda
     defensiva del lado servidor), señalá cada uno por separado — no los mezcles en una frase.
5. **No asumir el estado real a partir del estado del PR en GitHub.** Que un PR figure sin
   mergear no significa que el fix no esté desplegado (puede haberse promovido por otra vía), y
   que figure mergeado no confirma que ya esté en el ambiente que le importa al usuario (dev/qa/
   prod pueden estar en versiones distintas). Este skill NO verifica eso en vivo — decilo
   explícitamente en la salida como pendiente de confirmar explorando.
6. **Extraer info accionable para tests** — la parte más importante para quien recibe el resumen.
   Por cada cambio relevante, pensá en concreto:
   - Parámetros de query/API cuyo comportamiento cambia (ej. `?all=true`).
   - Condiciones de datos necesarias para reproducir la falla (ej. "requiere un registro con
     status DELETE compartiendo algún campo con uno activo").
   - Casos límite que el fix introduce o cierra (guardas nuevas, validaciones, edge cases).
   - Qué parte se puede verificar por API (rápido, determinístico) vs. qué requiere UI.
   - Si el repo de destino (AQ2) ya tiene cobertura relacionada: buscá en
     `knowledge-core/modules/*/tests.yaml` y `riesgos.yaml` por el área tocada, y decilo (no
     dupliques contexto que ya existe).
7. **Persistir el JSON en disco** (SIEMPRE, sin preguntar). Ver "Persistencia en disco" abajo.

## Salida en chat (formato fijo, para lectura humana)

Devolvé siempre esta estructura markdown en el chat. Si una sección no aplica, decilo
explícitamente — no la omitas en silencio.

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

### Conversaciones relevantes del PR
<comentarios humanos, filtrando code-review-bots. Por cada uno: autor + estado + 1-2 frases
del mensaje + valor para QA. Si no hay humanos, decir "ninguna">

### Info para tests
<bullets accionables: condición de datos/API necesaria para reproducir, qué se puede testear por
API vs UI, casos límite, cobertura ya existente en el knowledge-core si aplica>

### Sin verificar / a confirmar
<qué de todo esto no se confirmó en vivo y por qué>
```

Al final del bloque markdown, **agregá siempre** una línea confirmando la persistencia:
`-> Analisis persistido en reports/pr-context/<archivo>.json`

## Persistencia en disco (SIEMPRE)

La persistencia es **obligatoria**, no opcional. Cada invocación de la skill **debe** dejar un
artefacto JSON en disco bajo `reports/pr-context/` con la misma nomenclatura.

### Ubicación
```
reports/pr-context/YYYY-MM-DD-pr-<NUMBER>-<slug>.json
```

`reports/pr-context/` se crea si no existe (mkdir -p equivalente).

### Nomenclatura del archivo

- `YYYY-MM-DD`: fecha local de generación (no del PR — el PR puede ser viejo).
- `pr-<NUMBER>`: el número del PR (`<url>` → la parte `/pull/<N>`).
  - Si no hay número (raro), usar `pr-<slug>`.
- `<slug>`: derivado del **título del PR** humano. Reglas en orden:
  1. Strip del leading `#\d+\s+` si existe (ej. "#8450 ").
  2. Strip de prefijos conventional commits al inicio: `feat:`, `fix:`, `chore:`, `refactor:`,
     `docs:`, `test:`, `perf:`, `build:`, `ci:` (con espacio opcional después de los `:`).
  3. Lowercase.
  4. Reemplazar cualquier carácter que no sea `[a-z0-9]+` por `-`.
  5. Colapsar runs de `-` consecutivos a uno solo.
  6. Trim `-` al inicio/final.
  7. **Cap a 60 caracteres** (truncar en el último `-` antes del cap si quedó a media palabra).
  8. Si queda vacío (caso patológico), fallback a `analysis`.

Ejemplos:
- `#8450 feat: add media.category module to token profiles` → `add-media-category-module-to-token-profiles`
- `fix: 500 when ad-insertion has no source-id` → `500-when-ad-insertion-has-no-source-id`
- `chore(deps): bump mongoose to 7.5` → `deps-bump-mongoose-to-7-5`
- `#8400` (sin título útil) → `analysis`

### Idempotencia y reemplazos

Si el archivo ya existe en disco (mismo path), **sobreescribir** sin pedir confirmación — la
skill es read-only respecto al repo, pero el artefacto es propio y se considera cacheable. Si
el usuario lo commiteó, `git status` lo va a mostrar como modified; eso es esperado y
propositivo (re-análisis).

### Esquema del JSON (canónico)

Siempre las mismas claves top-level. Si una sección no aplica, incluirla con `null` o
explicitar "ninguno" / "no aplica" — **nunca omitir claves**.

```json
{
  "meta": {
    "skill": "pr-context",
    "generated_at": "<ISO 8601 con offset, ej. 2026-07-08T12:34:56-05:00>",
    "pr_url": "<url completa>",
    "pr_number": <int>,
    "source": "gh CLI"
  },
  "pr": {
    "title": "<título exacto>",
    "state": "OPEN | MERGED | CLOSED",
    "branch": { "head": "<>", "base": "<>" },
    "merged_at": "<ISO 8601> o null",
    "version_bump": "<ej. 7.0.64 -> 7.0.65>" o null,
    "issue_relacionado": { "number": <int>, "url": "<>", "title": "<>", "state": "<>", "solicitante": "<>" } o null
  },
  "motivo_del_cambio": {
    "tipo": "feature_nueva | bugfix | refactor | chore",
    "resumen": "<1-2 frases>",
    "necesidad_de_negocio": "<por qué se pidió, quién lo pidió, qué habilita>",
    "tipo_segun_review": "<score/10 + 1 frase>" o null
  },
  "comportamiento_antes": {
    "que_pasaba": "<1-3 frases en términos de comportamiento observable>",
    "resultado_observable": "<qué veía el usuario/consumidor>"
  },
  "causa_raiz": {
    "falla_de_diseño": "<explicación técnica breve>",
    "archivos_implicados": ["<...>", "<...>"],
    "nota": "<observación opcional: p.ej. 'el middleware ya soportaba la clave, sólo faltaba la lista'>"
  },
  "como_se_arreglo": {
    "cambios_funcionales": [
      {
        "file": "<path>",
        "cambio": "<qué línea/cambio>",
        "impacto": "<qué habilita>"
      }
    ],
    "cambios_mecanicos_ignorables": ["<path>: <motivo, p.ej. bump 7.0.64 -> 7.0.65>"],
    "cambios_NO_realizados_aunque_serian_utiles": ["<path>: <motivo, fuera de scope del PR>"]
  },
  "archivos_modificados": [
    {
      "path": "<>",
      "diff": "<resumen de 1 línea>"
    }
  ],
  "archivos_relacionados_o_afectados_indirectamente": {
    "middleware_que_ya_soportaba_la_clave": ["<path + línea>"],
    "endpoints_que_quedan_habilitados": ["<método + ruta>"],
    "ui_afectada": ["<ruta o vista>"],
    "smell_pre_existente_no_resuelto": ["<path>: <motivo>"]
  },
  "como_deberia_funcionar_despues_del_cambio": {
    "happy_path": ["<paso 1>", "<paso 2>", "<...>"],
    "contratos_json_involucrados": {
      "endpoint": "<>",
      "headers_esperados": ["<>"],
      "auth_flow": "<>",
      "respuesta_exitosa": "<>",
      "respuesta_rechazada": "<>"
    }
  },
  "cobertura_existente_en_knowledge_core": {
    "epic": "<path o null>",
    "acs_ya_definidos_para_este_cambio": ["<texto del AC>"],
    "tests_referenciados_en_tests_yaml": ["<id test o referencia>"],
    "status": "DISEÑADO | PARCIAL | COMPLETO | NO_APLICA"
  },
  "conversaciones_del_pr": [
    {
      "autor": "<login>",
      "estado": "<PENDING | APPROVED | CHANGES_REQUESTED | COMMENTED | etc>",
      "contenido": "<1-2 frases del mensaje, sin asumir que sea verdad>",
      "valor_para_qa": "<ALTO/MEDIO/BAJO + razón>"
    }
  ],
  "sin_verificar_en_vivo": {
    "estado_real_en_dev": "<qué de lo anterior no se confirmó en vivo>",
    "verificacion_recomendada": "<qué probar primero para confirmar el despliegue>"
  },
  "info_para_tests_recomendada": {
    "precondiciones": ["<...>"],
    "casos_a_cubrir": [
      {
        "tipo": "API | UI | e2e",
        "caso": "<descripción concreta>",
        "categoria": "smoke | regression",
        "nota": "<opcional>"
      }
    ],
    "posible_bug_latente_en_pr": "<patrón similar que reaparece o no aplica>"
  }
}
```

### Operación de disco (PowerShell nativo, no bash)

- Crear directorio: `New-Item -ItemType Directory -Force -Path 'reports/pr-context'`.
- Escribir JSON con `Write` (`UTF8`, sin BOM). Usar `JSON.stringify`-equivalent
  (`ConvertTo-Json -Depth 20`) para serializar, luego escribir. **Validar** el resultado
  con `Test-Path` + leer de vuelta `ConvertFrom-Json` antes de devolver el control.
- Si la escritura falla (permisos, etc.), **avisar inmediatamente** en el chat con el
  error exacto — no seguir en silencio.

## Qué NO hace este skill

- No navega el sitio en vivo (Playwright MCP).
- No corre ni escribe tests, no crea fixtures, no toca page objects.
- No toca `knowledge-core/` (ACs / riesgos / historias / tests.yaml).
- No delega a subagentes/workflows.
- **Sí persiste** el JSON de análisis en `reports/pr-context/` (es la única escritura).

El siguiente paso (explorar en vivo, elegir qué testear, escribir specs, commitear el
artefacto) lo decide el usuario, típicamente siguiendo con `/qa-module`.
