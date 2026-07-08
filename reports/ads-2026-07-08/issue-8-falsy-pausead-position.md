## Resumen
Bug **sm2 update.js** (rama VAST default): tres campos del form no se pueden limpiar pasando empty string `""` o empty array `[]` en el POST `/api/ad/:id`. El backend responde 200 OK pero el valor previo **persiste silenciosamente**. Verificado en vivo contra dev v7.0.71.

Misma familia que **LIVE-RISK-7** (`updateSchedule` ignora `description:''` e `is_featured:false`). Misma raiz: guardas `if (body.X)` o `if (X && trim(X) !== '')` que fallan cuando X es falsy.

## Pasos de reproduccion (smoke por API)

### Caso 1 — pausead.position no se limpia
```
POST /api/ad/new   { name:'X', type:'vast', is_enabled:'false', schedule:{ pausead:{ position:'top-left' } } }
GET  /api/ad/<id>  -> data.schedule.pausead.position = 'top-left'
POST /api/ad/<id>  { name:'X', type:'vast', is_enabled:'false', schedule:{ pausead:{ position:'' } } }
GET  /api/ad/<id>  -> data.schedule.pausead.position = 'top-left'  (PERSISTE - bug)
```

### Caso 2 — schedule.mid no se limpia con `[]`
```
POST /api/ad/new   { name:'X', type:'vast', is_enabled:'false', schedule:{ mid:[{tag:'https://a.example.com/vast.xml', position:'5'}] } }
GET  /api/ad/<id>  -> data.schedule.mid = [ {tag:..., position:'5'} ]
POST /api/ad/<id>  { name:'X', type:'vast', is_enabled:'false', schedule:{ mid:[] } }
GET  /api/ad/<id>  -> data.schedule.mid AUN tiene la entrada previa  (PERSISTE - bug)
```

### Caso 3 — pausead.duration / pausead.tag_mobile (sospecha, no confirmado)
- Mismo patron `if (X)` aplicado a `pauseadTag`, `pauseadDuration`, `pauseadTagMobile`, `pauseadDurationMobile`. Probe exhaustivo (`scripts/probe-ad-falsy-exhaustive.js`) mostro que **estos SI se limpian correctamente** con `''`. Solo `pausead.position` y `schedule.mid` son los verdader leaky.

## Esperado
- `pausead.position=''` debe limpiar el campo a `null` o `''`.
- `schedule.mid=[]` debe vaciar el array (o persistir `[]`).
- Mismas reglas para cualquier campo editable del form: "valor vacio enviado por el usuario" debe significar "dejar en blanco".

## Real
Persisten los valores previos en silencio (HTTP 200 OK da falsa sensacion de guardado).

## Codigo responsable (sm2)
`src/server/routes/api/ad/update.js` — ramas:

```js
// pausead.position (NO limpia ''):  <-- BUG
if (pauseadPosition && utils.trim(pauseadPosition) !== '') {
  ad.schedule.pausead.position = utils.trim(pauseadPosition)
}

// schedule.mid (NO limpia []):
} else if (req.body.schedule?.mid?.length > 0) {   // <-- salta si length == 0
  ad.schedule.mid = []
  for (item of req.body.schedule.mid || []) {
    if (/^[0-9]+%?$/.test(item.position || '') && (item.tag || '')?.trim?.() !== '') {
      ad.schedule.mid.push({tag: item.tag, position: item.position})
    }
  }
}
// Solo limpia mid si explicitamente se envia el string 'null':
// if (req.body.schedule?.mid === 'null') ad.schedule.mid = []   <-- TRIGGER debil
```

Hay una rama debil para limpiar mid (`mid === 'null'`), pero el UI nunca envia ese literal. La forma natural (`mid: []` o no enviar la clave) se ignora.

## Cobertura AQ2
- Reproducible: scripts/probe-ad-falsy-exhaustive.js
- Pendiente: agregar ADS-TC-16 al tests/api/ads.api.spec.js como prueba-viva (test.fail()) cuando se arregle.

## Heuristica violada
- Semantica de update parcial: un valor explicito del usuario (incluso vacio/falsy) debe aplicarse.
- Nielsen #3 (control y libertad del usuario: poder deshacer/limpiar).
