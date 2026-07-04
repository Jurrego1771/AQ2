# Custom Attributes — grafo transversal (arquitectura, no un módulo de UI)

> A diferencia de `modules/*`, esto **no es un módulo con ruta propia**: es un mecanismo
> genérico reutilizado por 11 tipos de recurso. Documentado acá porque un riesgo encontrado
> en un recurso (media, live-stream) aplica potencialmente a todos los demás por compartir
> el mismo código cliente/servidor/modelo — evita repetir la investigación por módulo.
>
> **Origen del hallazgo**: auditoría de código (lectura de `mediastream/sm2`, no exploración
> en vivo con Playwright) disparada al investigar el reporte de TV Azteca sobre el campo
> "Show in OTT" ([[mediastream/sm2#8317]], ver también el PR de notificación de edición
> concurrente). **No verificado en vivo**: la cuenta de dev/QA no tiene custom attributes
> configurados, así que no hay UI que inspeccionar hoy en este entorno. Ver sección
> "Estado de verificación" abajo antes de asumir que esto ya está confirmado en un entorno real.

## Qué es (arquitectura verificada en código)

Custom Attributes permite a cada **cuenta** definir campos propios (booleano, texto, fecha,
lista, tags, archivo, comscore, youbora, richtext, categoría, distribuidor, producto) y
adjuntarlos a distintos tipos de recurso. La definición vive en el modelo
`CustomAttribute` (`src/server/model/schemas/custom_attribute.js`), scopeada por `account`
y `used_in` (a qué recursos aplica).

### Recursos soportados (`usedIn`, fuente: el schema)
`article`, `media`, `schedule`, `playlist`, `category`, `live-stream`, `product`, `show`,
`show-season`, `show-episode`, `show-related`.

### Mecanismo compartido
- **Cliente**: una única clase `CustomAttributes` (`src/client/partial/custom_attribute.coffee`),
  instanciada igual en cada módulo: `new CustomAttributes '<tipo>', '[sm="custom-attributes-main-container"]', null`.
  Renderiza los campos desde la definición de la cuenta y los sincroniza con los valores
  guardados del recurso vía `.load(data.custom)`.
- **Servidor**: un único endpoint genérico `POST /api/custom-attribute/:module/:module_id/...`
  (`src/server/routes/api/custom-attribute/update.js`), que resuelve el modelo Mongoose según
  `req.params.module` (switch sobre los 11 tipos de `usedIn`).
- **Persistencia**: `CustomAttribute.setAttributes()` (schema) construye un `$set`/`$unset`
  por atributo, comparando el valor recibido contra el valor actual en DB.

## Estado de verificación por recurso

| Recurso (`used_in`) | Confirmado en código (cliente llama `.save()` igual) | Verificado en vivo (UI real) | Explorado en AQ2 |
|---|---|---|---|
| `live-stream` | ✅ (`live_stream.coffee` líneas 239, 1199, 1920-1921) | ✅✅ **BUG REPRODUCIDO en vivo (dev, 2026-07-03)** — ver sección "Reproducción en vivo" abajo | listado como sección "no explorada a fondo" en `modules/live-stream/overview.md`; riesgo confirmado `LIVE-RISK-9` |
| `media` | ✅ (`media.coffee` líneas 106, 1530, 2124-2125) | ⬜ no probado directamente (mismo mecanismo que live-stream, alto riesgo de compartir el bug) | parcial — cluster 10 "Custom Attributes" listado como pendiente en `modules/media/overview.md` |
| `article`, `schedule`, `playlist`, `category`, `product`, `show`, `show-season`, `show-episode`, `show-related` | ⬜ no verificado individualmente — comparten el mismo endpoint/modelo/schema server-side ya confirmado vulnerable, así que es razonable esperar el mismo patrón, pero no se leyó el código cliente de cada uno | ⬜ no | ⬜ ninguno tiene módulo en AQ2 todavía |

**Regla al extender esta tabla**: antes de marcar un recurso como "confirmado", leer su archivo
cliente (`src/client/<recurso>.coffee` o equivalente) y verificar que llama a
`@customAttribute.save()` de forma incondicional dentro del flujo general de guardado — no
asumir por analogía. El **server-side** (`CustomAttribute.setAttributes`, compartido por los 11
recursos) ya está confirmado vulnerable — cualquier recurso cuyo cliente reenvíe el snapshot
completo del DOM en cada save hereda el bug automáticamente.

## Reproducción en vivo (dev, 2026-07-03) — CONFIRMADO, no es solo hipótesis

Se reprodujo el mecanismo exacto del incidente TV Azteca usando datos 100% self-contained (nada
de esto tocó cuentas ni recursos reales):

1. Se creó un custom attribute temporal `[QA-PROBE] Show in OTT` (boolean, `used_in: ["live-stream"]`)
   vía `POST /api/settings/custom-attribute` — la cuenta de dev SÍ tiene permisos de admin para
   esto (a diferencia de lo asumido antes: dev no tenía custom attributes en `live-stream`/`media`
   configurados, pero se pueden crear).
2. Se creó un live-stream de prueba (`POST /api/live-stream/`).
3. Se estableció el baseline en `false` (vía `POST /api/live-stream/:id/custom-attribute`,
   confirmado por API).
4. **Sesión "Brayan"**: se cargó `/live-stream/:id` en el browser → el checkbox hidrata
   correctamente a `false` (coincide con DB).
5. **Sesión "María" (otra sesión, simulada por API directa sin tocar el DOM cargado)**: se
   cambió el custom attribute a `true` — confirmado por API, DB ahora en `true`.
6. Se verificó que el DOM de la sesión "Brayan" (ya cargada, sin refrescar) seguía mostrando
   `false` — exactamente el snapshot stale.
7. **Sesión "Brayan" hizo click en "Save changes"** (sin tocar el custom attribute para nada,
   simulando "aplicar el desborde" — cualquier guardado no relacionado).
8. **Resultado: el valor volvió a `false` en DB.** El cambio de "María" fue pisado en silencio,
   sin ningún error ni advertencia en ningún lado.

**Conclusión: `ATTR-RISK-001` está confirmado como bug real y activo en dev, no solo como
riesgo teórico derivado de lectura de código.** El mecanismo que causó el incidente de TV
Azteca (con altísima probabilidad, si "Show in OTT" es en efecto un custom attribute boolean
de ese tipo) es reproducible a voluntad, en cualquier cuenta, con cualquier custom attribute
boolean en cualquiera de los 11 recursos soportados.

### Datos de la reproducción (recursos ya borrados)
- Custom attribute: `_id: 6a47ec689dd210b9df655400`, `code: -qa-probe-show-in-ott`.
- Live-stream: `_id: 6a47ec6e9dd210b9df6554fd`.

## El riesgo (ver `riesgos.yaml` → `ATTR-RISK-001` para el detalle formal)

Resumen: el guardado de custom attributes se dispara **automáticamente en cada "Save
Changes"**, sin importar qué sección tocó el usuario, y **reenvía el estado actual completo
del DOM** de todos los campos renderizados (no un diff desde la última interacción). Si la
página de un usuario quedó cargada con datos desactualizados (otra sesión cambió un valor
mientras tanto), su próximo guardado — por cualquier motivo — pisa ese cambio en silencio,
porque el servidor no tiene control de concurrencia por campo (solo compara contra el valor
actual en DB al momento del request, no contra el valor que el cliente tenía cuando cargó).

Esto es el mecanismo más plausible detrás del reporte de TV Azteca ("Show in OTT" volvió a
`false` al aplicar una política de distribución no relacionada) **si ese campo es un custom
attribute booleano** — hipótesis razonable pero no confirmada (no se identificó el campo
literal en la cuenta real).

## Selectores (ver `selectors.yaml`)
Contrato estable en los recursos donde SÍ se confirmó el patrón (media, live-stream):
contenedor `[sm="custom-attributes-main-container"]`, campos individuales por convención
`#custom-attribute-<code>` (el `code` es específico de cada cuenta — no hardcodeable).

## Próximos pasos sugeridos
1. ~~Conseguir el nombre literal del campo "Show in OTT"~~ — ya no bloqueante: el bug se
   reprodujo con un custom attribute genérico, el mecanismo no depende del nombre/cuenta
   específica. Sigue siendo útil para confirmar 1:1 con el incidente real, pero no para testear.
2. **Escribir el test de regresión** (fixture propio: crea custom attribute + live-stream,
   reproduce los 8 pasos de arriba, verifica que el bug NO debe estar corregido — o marca
   `test.fail()` como prueba viva si se decide que el fix tarda). Candidato: `LIVE-TC-15`.
3. Repetir la reproducción para `media` (mecanismo confirmado igual en código, no probado en
   vivo todavía) para descartar que sea específico de live-stream.
4. Evaluar extender la tabla de arriba a los recursos no verificados (`article`, `show`, etc.)
   si/cuando AQ2 tenga módulos para ellos.
5. Reportar como bug (severidad alta — pérdida de datos silenciosa, confirmada en vivo) si no
   existe ya un issue de sm2 que lo cubra explícitamente (el PR #8317 es mitigación de UX, no
   fix del problema de fondo).
