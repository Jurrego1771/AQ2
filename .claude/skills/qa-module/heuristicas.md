# Heurísticas de exploración QA (referencia del skill qa-module)

## 1. Cosecha de marcas `sm:` en vivo (la fuente de selectores)
Las marcas reales están en el entorno corriendo, no en los `.coffee`. Con el Playwright MCP:

```js
// browser_evaluate
() => {
  const els = Array.from(document.querySelectorAll('[sm]'));
  const seen = new Map();
  for (const e of els) if (!seen.has(e.getAttribute('sm'))) seen.set(e.getAttribute('sm'), e.tagName.toLowerCase());
  return { url: location.pathname, total: els.length, unique: seen.size,
           marks: Array.from(seen, ([sm, tag]) => `${sm} <${tag}>`).sort() };
}
```
- Repetir por cada página/estado del módulo (listado, detalle, modales, estados vacíos).
- Colecciones con id en la marca (`media-container-<id>`) → usar `smPrefix()` en el POM.
- 3 layouts coexisten → contar/leer con `:visible`. Marca duplicada (ej. `total-medias` ×2) = usar
  `.first()` y filar como smell de testabilidad.

## 2. Checklist de heurísticas de Nielsen (10)
1. Visibilidad del estado (¿el contador/spinner refleja la realidad?).
2. Correspondencia con el mundo real (lenguaje, placeholders honestos).
3. Control y libertad del usuario (deshacer, limpiar, salir; estado en URL/compartible).
4. Consistencia y estándares.
5. Prevención de errores.
6. Reconocer mejor que recordar.
7. Flexibilidad y eficiencia (deep-link, atajos).
8. Diseño estético y minimalista.
9. Ayudar a reconocer/recuperarse de errores (estados vacíos útiles, mensajes claros).
10. Ayuda y documentación.

## 3. Accesibilidad (WCAG 2.1, lo de mayor ROI)
- **4.1.2 Name, Role, Value (A):** controles solo-ícono deben tener `aria-label`/texto. Detección:
  buscar `button`/`a` con accessible-name vacío en el snapshot.
- Navegación y foco por teclado; orden lógico; contraste.

## 4. Performance / eficiencia
- Polling: ¿hay `setInterval`/`setTimeout` que repite requests aun inactivo? (medir en
  `browser_network_requests`). Preferir websocket/back-off.
- DOM bloat: elementos renderizados N× (layouts ocultos), listas sin virtualizar.
- Requests redundantes o que fallan (CORS, 401/403) en cada carga.

## 5. Fiabilidad — consola y red
- `browser_console_messages` (level error, all): errores recurrentes entierran los reales.
- `browser_network_requests`: estados !=2xx en recursos propios (distinguir de 3ros: Datadog/Intercom).

## 6. Seguridad — smoke no destructivo
- XSS reflejado: introducir un probe BENIGNO (`<b>QAXSS</b>`) en inputs de búsqueda/filtros y
  verificar que NO se renderiza como elemento (debe ir escapado). No payloads dañinos.
- No probar DoS, inyección destructiva ni evasión.

## 7. Protocolo de honestidad (obligatorio)
- **Verificar antes de filar:** un `[sm="no-result"]` con `getBoundingClientRect().height === 0`
  NO es visible aunque exista → no es bug. Comprobar visibilidad real, no presencia en DOM.
- Si la sospecha no se confirma, **retractarse** explícitamente.
- Balancear: registrar hallazgos positivos. Severidad realista (medium/low casi siempre en dev).

## 8. Patrones de robustez de specs
- `expect.poll(() => page.algo(), { timeout: 10_000 })` para UI que carga async (lista por XHR
  tras la toolbar). Nunca `sleep`.
- Esperar la primera card antes de derivar datos: `items.first().waitFor({ state: 'visible' })`.
- `:visible` por el 3× layout. `storageState` para sesión.
- Derivar términos/datos del entorno (palabra alfabética del primer título), no hardcodear:
  ojo, la búsqueda de media matchea **palabra completa**, no substring (issue #10).
