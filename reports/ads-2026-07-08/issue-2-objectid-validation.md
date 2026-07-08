## Resumen
Los handlers `src/server/routes/api/ad/detail.js` y `delete.js` no llaman a `mongoose.isValidObjectId(req.params.ad_id)` antes de hacer `Model.findOne({_id: req.params.ad_id, account})`.

Con un id no-hex (p.ej. el literal `'new'` que el form de creacion usa como segmento), Mongoose lanza CastError y cae en la rama falsy del `if (ad)` -> 404. Pero **NO HAY GARANTIA explicita**, y si el handler se modifica en el futuro para serializar `err` (como hacia LIVE-RISK-1 en `/api/live-stream/:id/recording`) la respuesta pasaria a ser 500 con `{status:'ERROR', data:'DB_ERROR'}` (information exposure, CWE-209).

## Pasos
```
GET /api/ad/new      ->  (Mongoose CastError capturado por el falsy branch -> 404 hoy)
```

## Esperado
Validar el id con `mongoose.isValidObjectId` y responder 404 consistente (o 400) sin serializar el error de Mongoose.

## Real
Depende del orden del if/else del handler. Hoy es 404 pero fragil ante cualquier futura modificacion.

## Cobertura AQ2
Sin prueba viva AQ2 explicit todavia (cubrible con test.fail que pegue contra `/api/ad/new` y documente la respuesta - **pendiente ADS-RISK-1**).

## Heuristica violada
- OWASP Improper Error Handling / Information Exposure (CWE-209).
- Patron hermano de LIVE-RISK-1 (recording 500 ante id invalido).
