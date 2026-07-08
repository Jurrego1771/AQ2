# AQ2 — QA UI Automation (Mediastream SM2)

Suite de automatización **Playwright + JavaScript plano (NO TypeScript)** para el admin SM2.
Estas reglas son **no-negociables** y aplican a toda sesión.

## Para empezar o extender un módulo
Ejecuta **`/qa-module <nombre>`** (skill en `.claude/skills/qa-module/`). Es el procedimiento
canónico: explorar en vivo → reportar bugs → escribir specs → poblar knowledge-core.

> `knowledge-core/AGENTES.md` y `fljoQA.md` son **visión/metodología** (contexto), NO se
> implementan como pipeline de 8 agentes. El flujo real es el skill `qa-module`.

## Entorno y sesión
- SUT y credenciales se resuelven en `src/utils/env.js` (`ENV` → dev/qa/prod). Default: **dev**
  (`https://dev.platform.mediastre.am`, sin 2FA).
- Login una sola vez en `src/fixtures/auth.setup.js` → `.auth/user.json` (storageState reusado).
  El form de login NO tiene marcas `sm:` (es la única excepción: se usa por rol).
- **Nunca** commitear secretos (`.env`, `.auth/` están en `.gitignore`).

## Selectores — escalera de selectores estables
- Helpers en `src/utils/selectors.js`. Prioridad en los Page Objects:
  1. `sm()` / `smPrefix()` → `[sm="..."]` — **preferido** (contrato QA explícito del front).
  2. `dataName()` → `[data-name="..."]` — **aceptado como fallback** cuando el elemento aún no
     tiene marca `sm:`. `data-name` es semántico y lo usa la propia app para serializar el form
     (verificado en vivo), así que es estable de facto, NO frágil.
  3. `stable()` → `[sm="x"], [data-name="x"]` — prefiere `sm:` y cae a `data-name` en un solo
     selector: el mismo test sigue verde el día que el front agregue `sm=`, sin reescribir.
  4. `getByRole` / `getByLabel` — aceptado para controles estándar accesibles.
- **PROHIBIDO** siempre: texto visible, clase CSS o XPath posicional (eso sí es frágil).
- Falta de marca `sm:` = deuda de testabilidad: se reporta a GitHub igual (bug de front), pero
  **NO bloquea cobertura** — se cubre con `dataName()`/`stable()` y se migra a `sm:` cuando exista.
- La página renderiza 3 layouts (grid/list/minimal) a la vez → filtrar `:visible` para contar/leer.
- **Cosechar las marcas reales EN VIVO** con el Playwright MCP
  (`querySelectorAll('[sm]')` y `querySelectorAll('[data-name]')`), nunca inferirlas de los
  `.coffee` del repo fuente sm2.

## Knowledge-core — Definición vs Derivado
- El YAML en `knowledge-core/` es la **fuente de verdad** (historias/AC, riesgos, definición de tests).
- Ejecución, resultados y cobertura son **DERIVADOS** del report de Playwright → **jamás a mano**.
- `modules/<m>/tests.yaml → refs` es la **fuente única** de los vínculos:
  `validates` (AC), `mitigates` (riesgos), `story`, `spec`.
- **No** escribir reverse-links (`validado_por_test`, `tests_asociados`, `riesgos_asociados`,
  `mitigado_por_test`) ni estado de ejecución: el build los derivará (Fase 3, diferida).
- Los **bugs viven en GitHub** (`Jurrego1771/AQ2#N`); aquí solo se referencian en
  `riesgos.yaml → defectos_relacionados`.

## IDs y tags
- IDs por módulo: `<PFX>-RISK-N`, `<PFX>-TC-N`, `<PFX>-AC-N` (únicos por módulo). `US-N` global.
  media = `MED`. **Estables**: nunca renombrar ni reusar.
- El título del spec lleva SOLO el id de correlación `@<PFX>-TC-N` + la capa (`@smoke`/`@regression`).
  Los vínculos a AC/riesgo/historia viven en `tests.yaml → refs`, no en el título.

## Honestidad de QA (crítico)
- **Verificar cada hallazgo antes de reportarlo.** Descartar falsos positivos (ej. un `no-result`
  con `height:0` no es visible aunque exista en el DOM). Si una sospecha no se confirma, retractarse.
- Balancear: anotar también lo que funciona bien. Severidad realista, no inflada.

## Robustez de specs
- Aserciones sobre UI async con `expect.poll` (no one-shot): la lista carga por XHR tras la toolbar.
- 1 retry local (entorno dev compartido) — no enmascara bugs reales (fallan en ambos intentos).
- `test.fail()` para bugs conocidos: prueba viva en rojo-esperado hasta que se corrija el issue.

## Acciones externas
- Crear issues de GitHub (`gh issue create`) de forma **automática** al hallar bugs reales.
- **DETENERSE y pedir confirmación antes de cualquier `git commit` / `git push`.**

## Comandos
- `npx playwright test --project=smoke --project=regression` — suite UI.
- `npm test` / `npm run smoke` / `npm run regression` — atajos.
