# Account — Overview estructural (mapa del módulo)

> Módulo mínimo a propósito (2026-07-04): un único endpoint backend sin superficie de UI en el
> admin SM2. No confundir con la sesión/autenticación de un usuario del admin (eso vive en
> `src/utils/env.js` + `src/fixtures/auth.setup.js` a nivel de la suite, no como módulo QA).

Prefijo de IDs: **ACC**.

## Endpoint cubierto
`GET /api/account/:account_id/dfp/full` (`src/server/routes/api/account/dfp/full.js`) — feed RSS
de anuncios DFP de una cuenta, consumido externamente (Google DFP), no por el admin SM2. Sin
marcas `sm:`, sin flujo de UI — no aplica `selectors.yaml` para este módulo.

## Contrato de error (verificado en vivo, 2026-07-04)
- `account_id` inexistente → `200 OK`, body `{ "status": 401, "data": "Not Allowed" }`.
- ⚠️ **Contrato pre-existente, no introducido por el fix de sm2#8423**: esa rama nunca llama
  `res.status(401)` — el HTTP status real de la respuesta es `200` pese a que el body declare
  `status: 401`. Si se integra un consumidor que valide por HTTP status code (no por body), esto
  rompe esa expectativa. Documentado, no corregido (fuera del alcance del PR que lo originó).
- Antes de sm2#8423: `account?.dfp?.enabled` era `account.dfp?.enabled` sin el primer optional
  chaining → `account_id` inexistente (`account === null`) crasheaba con
  `TypeError: Cannot read properties of null (reading 'dfp')`.

## Otros hallazgos del mismo PR (sm2#8423), NO cubiertos por test automatizado aquí
Ver `epics/account-management/historias.yaml` (notas de US-017) para el detalle de por qué cada
uno no es alcanzable de forma confiable con el harness actual de AQ2 (gRPC, Redis directo,
condición de carrera, o Show/Season/Episode sin API REST de creación). El más relevante —
`event_schedule.js`, con riesgo de mutar el episodio equivocado— quedó documentado como
`LIVE-RISK-10` en el módulo `live-stream`.
