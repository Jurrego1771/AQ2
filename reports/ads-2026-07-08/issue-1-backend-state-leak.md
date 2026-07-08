## Resumen
Bug doble en `src/server/routes/api/ad/update.js` (sm2):

1. **Typo en rama default 'vast'** (linea ~245):
   - El codigo dice `ad.gdai = null`
   - Deberia ser `ad.google_dai = null` (como hace `create.js` linea ~188).
   - Mongoose ignora campos desconocidos del schema, asi que la linea es NO-OP.
   - Resultado: al cambiar un Ad de `ad-insertion-google` a `vast`, el campo `google_dai.source_id` (que se esperaba limpio) PERSISTE silenciosamente.

2. **State leak en rama `ad-prebid`** (linea ~100):
   - NO hace `ad.insertion = null`, `ad.google_dai = null`, `ad.vmap = null`, `ad.adswizz = null`.
   - Resultado: cambiar un Ad de `ad-insertion` a `ad-prebid` deja `insertion` previo persistido.

## Pasos de reproduccion (smoke por API)

### Caso 1 (state leak ad-prebid):
```
POST /api/ad/new      { name:'X', type:'ad-insertion',      is_enabled:'false', insertion:{tag:'', loop:null} }
GET  /api/ad/<id>     -> data.insertion existe
POST /api/ad/<id>     { name:'X', type:'ad-prebid',         is_enabled:'false', prebid:{...} }
GET  /api/ad/<id>     -> data.insertion AUN existe (bug, deberia ser null)
```

### Caso 2 (typo gdai):
```
POST /api/ad/new      { name:'X', type:'ad-insertion-google', is_enabled:'false', gdai:{sourceId:'SRC', hmac:'H'} }
GET  /api/ad/<id>     -> data.google_dai.source_id = 'SRC'
POST /api/ad/<id>     { name:'X', type:'vast', is_enabled:'false', schedule:{pre:{tag:'https://example.com/vast.xml'}, post:{tag:''}, mid:[]} }
GET  /api/ad/<id>     -> data.google_dai AUN tiene source_id (deberia estar null)
```

## Esperado
- Tras cambiar el tipo, los campos del tipo anterior quedan NULL.
- Sin persistencia de campos no usados por el nuevo tipo.

## Real
Persisten como garbage silenciosa, no se limpian.

## Cobertura en vivo
Pruebas-viva AQ2 rojo-esperado (test.fail):
- **ADS-TC-14** (`tests/api/ads.api.spec.js`) - typo gdai
- **ADS-TC-15** (`tests/api/ads.api.spec.js`) - state leak ad-prebid

Cuando se arregle el bug, esos tests pasaran en verde y daran la senal para quitar `test.fail(true, ...)`.

## Notas
Misma familia de bug que LIVE-RISK-7 (`updateSchedule` ignora `description:''` y `is_featured:false`). El backend tiende a no limpiar campos al cambiar tipo/seccion.
