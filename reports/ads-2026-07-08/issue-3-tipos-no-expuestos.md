## Resumen
El backend acepta 8 tipos de Ad (`vast|vmap|googleima|local|ad-insertion|adswizz|ad-insertion-google|ad-prebid`, verificado leyendo `create.js` y `update.js` en `src/server/routes/api/ad/*`). Pero:

1. La UI solo expone 5 tipos con marca `sm:` unica:
   - `vast` -> boton 'AdServer' (`sm='type-vast'`)
   - `vmap` -> boton 'VMAP' (`sm='type-vmap'`)
   - `local` -> 'Media' + 'Ad Replacement' (`sm='type-local'` compartido, ver issue [Tech-debt] sobre marcas compartidas)
   - `ad-insertion-google` -> boton 'Google MRSS Feed' (`sm='type-ad-insertion-google'`)
   - `ad-prebid` -> boton 'Prebid' (`sm='type-prebid'`)
   Los tipos `ad-insertion`, `googleima`, `adswizz` NO son seleccionables en el form.

2. El listado SI tiene filas de tipo 'Ad Insertion' (legacy) - cosechado en vivo: `[QA-AUTO] ad-insertion_dur0_1783241823019` con tipo 'Ad Insertion' en la columna Type.

3. En el detalle, los 6 botones no reflejan de forma fiable cual esta activo. Ademas para un Ad de tipo `ad-insertion`, el unico boton con clase `active` observado fue **'Ad Replacement'** (incoherente con el tipo real).

## Pasos de reproduccion
1. Listar en `/ad`. Observar las primeras filas en dev v7.0.71: `[QA-AUTO] ad-insertion_dur0_...`.
2. Click en una fila de tipo `Ad Insertion` -> abre `/ad/<id>`.
3. Mirar el selector Type: ninguno de los 6 botones aparece marcado coherentemente como 'active' para un Ad tipo Ad Insertion - el boton 'Ad Replacement' lleva la clase `active` (incoherente).

## Esperado
- El selector Type debe mostrar como activo el tipo real del Ad.
- Los tipos legacy deben ser accesibles desde la UI o eliminados del backend (decidir y migrar).

## Real
Indicador de tipo activo desincronizado, y los tipos legacy no se pueden crear/editar desde la UI: hay que hacerlo via API.

## Heuristica violada
- Nielsen #3 (control y libertad: el usuario debe poder ver y editar el tipo).
- Nielsen #6 (reconocer mejor que recordar: el boton activo debe representar el estado real).
- Nielsen #4 (consistencia entre UI y datos persistidos).

## Cobertura AQ2
No automatizable por API. Cubierto parcialmente por **ADS-TC-7** (el form expone 5 marcas unicas) y **ADS-TC-9** (selector AdServer muestra su seccion). El **estado activo del detalle** no esta cubierto.
