---
name: promote-issues
description: >
  Promueve issues de QA aprobados desde AQ2 (Jurrego1771/AQ2) al repo del equipo de desarrollo
  (mediastream/sm2). AQ2 es un filtro/staging: solo se promueven los issues ABIERTOS con label
  `sm2` (aprobados en el gate del usuario). El skill REESCRIBE cada issue a lenguaje de producto/
  causa raíz, pide aprobación, y delega la parte mecánica e idempotente al script
  `scripts/promote-to-sm2.sh` (crear en SM2 + cerrar el AQ2 con cross-link + repuntar los
  `test.fail`). Invocación: /promote-issues [<aq2#> ...].
---

# promote-issues — promover hallazgos aprobados de AQ2 a SM2

Parte INTELIGENTE del flujo de promoción (ver la memoria `issue-promotion-aq2-to-sm2`). El skill
razona y reescribe; la mecánica correcta/idempotente vive en `scripts/promote-to-sm2.sh` y **el
skill nunca crea ni cierra issues con sus propias manos** — siempre pasa por el script. Así la
garantía de no-duplicar está en un solo lugar probado.

## Modelo (recordatorio)
- **AQ2 es filtro/staging**, no un tracker paralelo. Al promover, el bug pasa a vivir SOLO en SM2
  y el issue de AQ2 se **cierra** con link cruzado. El estado cerrado ES la marca de "ya subido"
  (idempotencia sin label extra).
- Candidatos = issues **abiertos** con label `sm2`. Los que no se promueven (deuda de
  testabilidad, ej. marcas `sm:`) se quedan abiertos en AQ2.

## Entrada
`$ARGUMENTS` = cero o más números de issue de AQ2 a promover. Si no se pasan, listar candidatos y
preguntar cuáles. **Nunca** promover algo que el usuario no haya pedido explícitamente en esta
sesión (crear en SM2 es acción externa al repo del equipo).

## Procedimiento

1. **Listar candidatos:** `bash scripts/promote-to-sm2.sh --list`. Si el usuario no indicó números,
   mostrarle la lista y pedir cuáles promover. Si un número que pidió NO está en la lista (cerrado
   o sin label `sm2`), decírselo y no continuar con ese — el gate es del usuario, no self-aprobar
   agregando el label.

2. **Leer el issue de AQ2 completo:** `gh issue view <aq2#> --repo Jurrego1771/AQ2 --json title,body,labels,comments`.
   Leer también el knowledge-core del módulo si aporta causa raíz (riesgos.yaml, overview.md).

3. **Reescribir a lenguaje de producto/causa raíz para SM2** (lo más importante). El body de AQ2
   tiene lenguaje interno de QA; el de SM2 va dirigido al dev que arregla. Reglas:
   - **Quitar** IDs internos de QA (`PLST-TC-N`, `@smoke/@regression`, `test.fail`), la jerga de
     política de selectores y referencias a specs de AQ2.
   - **Estructura sugerida:** Resumen · Comportamiento esperado · Reproducción · Causa raíz probable
     (inferir archivos/lógica fuente cuando se pueda) · Estándar/heurística violada.
   - Describir el defecto en términos **observables** y de **contrato** (ej. "debe responder 400,
     no 500"), no en términos de "el test tal falla".
   - No inventar causa raíz si no hay evidencia: marcarla como "probable" y decir qué falta
     confirmar. Mantener la honestidad de QA (severidad realista).
   - Escribir el body reencuadrado a un archivo temporal (usar el scratchpad de la sesión).

4. **Mostrar el borrador al usuario y pedir aprobación** del título + body ANTES de tocar SM2.
   Si ajusta algo, iterar sobre el archivo.

5. **Dry-run:** `bash scripts/promote-to-sm2.sh --promote <aq2#> --body <archivo> --title "<título>" [--sm2-label <l>] --dry-run`.
   Revisar con el usuario el destino, el AQ2 a cerrar y las referencias que se repuntarán.

6. **Promover (real), solo con OK explícito:** el mismo comando **sin** `--dry-run`. El script:
   crea el issue en SM2, cierra el de AQ2 con el comentario de cross-link, e imprime el número de
   SM2 y la lista de referencias a repuntar.

7. **Repuntar las referencias al tracker durable (SM2):** el script solo las LISTA; el skill hace
   las ediciones. Por cada referencia hallada, cambiar `Jurrego1771/AQ2#<n>` (y las URLs
   `github.com/Jurrego1771/AQ2/issues/<n>`) al nuevo `mediastream/sm2#<sm2n>`:
   - El mensaje de `test.fail(...)` del spec vivo.
   - `knowledge-core/modules/<m>/riesgos.yaml → defectos_relacionados`.
   - Menciones en `overview.md` / `historias.yaml` si aplica.
   Ojo: repuntar solo lo que corresponde al bug promovido; no tocar menciones de otros issues.

8. **Cierre:** resumir qué se promovió (AQ2#N → SM2#M) y qué referencias se repuntaron.
   **DETENERSE antes de cualquier `git commit`/`push`** (regla del proyecto): los cambios de
   repunte quedan en el working tree para que el usuario los revise y commitee.

## Notas
- El script resuelve el repo SM2 desde `$SM2_GITHUB_REPO` / `.env` (default `mediastream/sm2`) y
  AQ2 desde `AQ2_REPO` (default `Jurrego1771/AQ2`).
- Labels en SM2: **la cuenta QA (`Jurrego1771`) NO tiene permiso de triage en `mediastream/sm2`**
  — `gh issue create --label` crea el issue pero el label no se aplica (y `gh issue edit --add-label`
  falla con `AddLabelsToLabelable` sin permiso). Por eso: **promover SIN `--sm2-label`** y dejar que
  el equipo dev lo clasifique en su triage (la taxonomía es de ellos). La atribución de origen QA
  ya va en el footer del body. No crear labels nuevos en el repo del equipo (práctica: adoptar su
  taxonomía, no imponer la propia).
- Idempotencia: si un issue ya fue promovido está cerrado → el script lo rechaza. No forzar.
