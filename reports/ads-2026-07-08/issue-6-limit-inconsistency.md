## Resumen
La peticion del front lleva `limit=11` aunque el dropdown de paginacion ofrece **'12 per page'** como opcion por defecto. El contador visible **'1 - 11'** es honesto con la API, pero el usuario que espera 12 resultados por pagina ve 11 -> friccion / inconsistencia menor entre el selector UI y la realidad.

## Pasos de reproduccion
1. Ir a `/ad`. Observar `'1 - 11'` (selector `sm="current-skip"`) y dropdown `'12 per page'` (selected).
2. Inspeccionar la peticion: `GET /api/ad?limit=11&skip=0&status=0&query=&_=<ts>`.

## Esperanza
- Si la API acepta 12, alinear el param `limit` del front con el valor visible del dropdown (12, 24, 48 o 96 segun seleccion).
- Si por diseno del front es siempre 11, ajustar el dropdown para que diga '11 per page' o quitar la opcion '12 per page'.

## Real
El param `limit=11` parece estar hardcoded o se calcula mal en `src/client/ads.coffee`. El dropdown dice '12 per page' (smell de inconsistencia UI entre persistencia y selector visible).

## Heuristica violada
- **Nielsen #4** (consistencia y estandares).
