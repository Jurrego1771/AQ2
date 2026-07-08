## Resumen
En el form `/ad/new` y `/ad/:id`, los botones del selector Type:

| Label UI | Marca `sm:` | Notas |
|----------|--------|-------|
| AdServer        | `type-vast`               | unico |
| VMAP            | `type-vmap`               | unico |
| Media           | `type-local` (nth 0)     | compartido con Ad Replacement |
| Ad Replacement  | `type-local` (nth 1)     | mismo sm que Media |
| Google MRSS Feed| `type-ad-insertion-google` | unico |
| Prebid          | `type-prebid`             | unico |

### Smells
1. **'Media' y 'Ad Replacement' comparten `sm='type-local'`** -> solo direccionables por `.nth(0)/.nth(1)` en tests. Fragil ante reorden visual o i18n.
2. El backend acepta tipos `ad-insertion`/`googleima`/`adswizz` que la UI no expone (ver issue hermano sobre tipos no expuestos).

## Esperanza
Asignar `sm` distintas a cada tipo: `type-vast-server`, `type-vmap`, `type-local-media`, `type-local-replacement`, `type-ad-insertion-google`, `type-ad-prebid`. Si se mantienen los tipos legacy, exponerlos tambien (`type-ad-insertion`, `type-googleima`, `type-adswizz`).

## Real
El POM tiene que recurrir a `.nth(0).click()` / `.nth(1).click()` para diferenciar Media/Ad Replacement (ver `src/pages/ads.page.js`). Tests y futuros i18n o reordenes del UI van a romperse.

## Cobertura AQ2
Cubierto por **ADS-TC-7** (assertion de que `type-local` cuenta 2 botones).

Misma familia de smell que:
- **LIVE-RISK-3** (`sm='top-filter'` x3 en live-stream)
- **SM2#35** (indicadores de status Published sin marca sm: en show detail)

Patron recurrente de **deuda de testabilidad**.

## Heuristica violada
- Contrato QA del proyecto (CLAUDE.md, escofina de selectores estables): selectores `sm:` unicos por control.
