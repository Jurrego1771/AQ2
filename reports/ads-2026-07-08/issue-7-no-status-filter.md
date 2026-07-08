## Resumen
La API `GET /api/ad` acepta `status=0` (todos, default del front) y por implicacion otros valores para filtrar publicados/no publicados. El front solo envia `status=0` y la UI no expone ningun control para alternar.

En una cuenta con muchos Ads (74+ observados en dev v7.0.71), **es imposible ver solo los no publicados desde el listado**. Tendria que recurrirse a un query SQL directo o un script externo.

## Pasos de reproduccion
1. Ir a `/ad`. Listar todos los ads (74 visibles en dev).
2. Intentar filtrar por 'No publicados' -> no existe control en la toolbar.

## Esperanza
Anadir chip o dropdown en la toolbar (similar a LIVE-Stream's `top-filter`) que envie `status=0|1|2` (todos/publicados/no publicados). Confirmar primero si la API soporta valores !=0.

## Real
- UI carece del control.
- El param `status=1` no es facilmente testeable desde la UI.

## Cobertura AQ2
No automatizable: el control no existe en DOM. Cubrible cuando se implemente.

## Heuristica violada
- **Nielsen #3** (control y libertad del usuario: poder filtrar).
- **Nielsen #5** (prevencion de errores: ver un subconjunto reduce carga cognitiva).
