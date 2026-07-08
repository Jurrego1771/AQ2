## Resumen
Multiples controles UI en el modulo Ads no exponen texto visible ni `aria-label` ni `title`:

### Listado `/ad`
- **Paginador**: `<a href='#next'><i class='glyphicon glyphicon-chevron-right'></i></a>` x 2 (top + bottom paginator).
- **Paginador**: `<a href='#previous'><i class='glyphicon glyphicon-chevron-left'></i></a>` x 2.
- **Status por fila**: `<i class='glyphicon glyphicon-ok'>` sin texto (4 ocurrencias minimas).

### Form `/ad/new` y `/ad/:id`
- **Botones solo-icono** (todos con `sm:` pero sin accessible-name):
  - `add-midroll`
  - `preroll-params-edit`, `preroll-params-mobile-edit`
  - `midroll-params-edit`
  - `postroll-params-edit`
  - `vmap-params-edit`, `vmap-mobile-params-edit`
- **Toggle Status** (Published/Not Published): no muestra su role/`aria-checked`/etc al toggle visual.

### Total estimado
~13 controles inaccesibles por nombre, contando top + bottom de paginador.

WCAG 2.1 SC 4.1.2 Name, Role, Value (nivel A) + SC 2.4.4 Link Purpose (In Context).

## Pasos de reproduccion
1. Cargar `/ad` y abrir el lector de pantalla.
2. Intentar tabular al paginador -> no hay nombre para 'next'/'previous'.
3. Cargar `/ad/new`, tabular a la seccion Pre-roll -> los botones '+' de mid-roll no se anuncian.
4. Intentar automatizar con `getByRole('button', { name: ... })` -> sin name accesible, falla.

## Esperado
Cada control accionable por mouse deberia ser accionable por teclado y por lector de pantalla (nombre accesible via `aria-label`, `sr-only` text o atributo `title`).

## Real
Los controles solo-icono son 'ciegos' para tecnologias asistivas. Tests no pueden automatizar clicks por accessible name (solo por `.nth()` o coords manuales, fragil).

## Cobertura AQ2
Sin automatizacion a11y todavia (axe-core no instalado en el harness AQ2). Cubrible manualmente o via integracion futura de axe-core en los specs.

## Heuristica violada
- **WCAG 2.1 SC 4.1.2 (A)** Name, Role, Value.
- **WCAG 2.1 SC 2.4.4 (A)** Link Purpose (In Context).
