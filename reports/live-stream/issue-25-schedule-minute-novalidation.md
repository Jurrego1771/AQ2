## Resumen

El endpoint `POST /api/live-stream/:id/schedule-job/` NO valida que `date_start_minute` y `date_end_minute` esten en el rango valido (0-59). Probado en dev con `date_start_minute: 99`: el server responde 200 OK y persiste el schedule (verificado via GET posterior con LIVE-TC-67).

## Pasos de reproduccion

1. Crear un live por API (cualquier tipo).
2. POST a `/api/live-stream/:id/schedule-job/` con body:
   ```json
   {
     "name": "QA invalid minute",
     "type": "onetime",
     "date_start": "<futuro>",
     "date_end": "<futuro>",
     "date_start_hour": 10,
     "date_start_minute": 99,
     "date_end_hour": 12,
     "date_end_minute": 0,
     "tz_offset": 0
   }
   ```
3. Observar: respuesta 200 (deberia ser 400 INVALID_MINUTE o similar).
4. GET al schedule creado: el campo `date_start_minute` aparece con 99 (o el valor enviado).

## Expected

- Respuesta 4xx con error explicito (INVALID_DATE_ERROR_INVALID_MINUTE o similar).
- O al menos normalizacion silenciosa (coerce a 0-59).

## Actual

- 200 OK, schedule persistido con el valor invalido.

## Impacto

- Data integrity: schedules con horarios imposibles (minuto 99) en la DB.
- Front puede mostrar valores raros / no esperados.
- Cualquier consumidor que asuma rango valido se rompe.

## Evidencia

- `tests/api/live-stream-schedule-edge.integration.spec.js` -> LIVE-TC-67 (prueba viva: `test.fail(true, ...)`).
- Corrio en dev v7.0.72, runId=09916c.

## Heuristica violada

Nielsen #5 (prevencion de errores) + semantica HTTP (4xx para input invalido, no 200).

## Fix sugerido

Agregar validacion en el server (en el mismo lugar que la validacion de hour, si existe) o en el schema Mongoose. Reusar el patron de los otros errores INVALID_DATE_ERROR_*.
