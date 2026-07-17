# Purchase — Overview estructural (mapa del módulo)

> Conocimiento **estructural/factual**; el comportamiento vive en `historias.yaml` (AC) y
> `riesgos.yaml`. Módulo nuevo (2026-07-14). Prefijo de IDs: **PUR**.
> Dominio de **pagos reales** → cobertura SOLO de lectura y contrato de errores.

## Qué es
Las **compras** de un customer (`model.CustomerPurchase`): suscripciones, PPV, one-time, etc.,
con sus **pagos** (`PurchasePayment`) por gateway. Es un **sub-recurso del customer** (no tiene
pantalla propia): se muestra embebido en el detalle del customer, sección "Purchases".

## Modelo `CustomerPurchase` (sm2 schemas/customer_purchase.js)
- `customer` (ref), `account` (ref), `payments[]` (ref PurchasePayment)
- `status`: **SUCCESS / FAILURE / PENDING** (default PENDING)
- `type`: **subscription / ppv / other / one-time** (required)
- `product_id`, `product_name`, `product_type`, `product.{id,paymentMethod}`
- `amount`, `tax_percent`, `currency`, `gateway` (stripe/payu/paypal/tbk-oc/apple_store…)
- `valid_until`, `trial`, `subscription_cancelled`, `cancel_date`, `metadata`, `sale` (seller/reseller)

## Endpoints (bajo customer) — sm2 routes/api/customer/purchase/
| Uso | Método + path |
|---|---|
| Listado (filtros: payments, product_id, status, limit; sort -date_created) | `GET /api/customer/:customer_id/purchase` |
| Detalle (populate payments) | `GET /api/customer/:customer_id/purchase/:purchase_id` |
| Crear | `POST .../purchase` (create.js — pagos reales, fuera de alcance) |
| Actualizar | `POST .../purchase/:id` (update) |
| Pagos | `.../purchase/:id/payment/{create,update,check,e_fact}` |
| Factura | `.../purchase/:id/invoice` |

Errores verificados en vivo: customer inexistente → `404 CUSTOMER_NOT_FOUND`; purchase
inexistente → `404 PURCHASE_NOT_FOUND`; customer real sin compras → `200 {data:[]}`.

## UI (embebida en el detalle del customer)
`/customer/:id` (views/customer.coffee) → sección **Purchases**:
- Contenedor: `sm="div-purchases"` (header "Purchases").
- Tabla: `data-name="purchases-list"` (columnas: ID, Gateway, Amount, Currency, Product Type,
  Product Name, Status, Recurrency, Payments, Recurrency Cancelled Date, Date Created, Valid
  Until; estado vacío: "No purchases have been made").
- También `data-name="payments-list"`. Filtros de pagos en `/customer/payments`.

## Cobertura actual en AQ2 (sesión 2026-07-14)
5 tests, SOLO lectura + contrato:
- API: `tests/api/integration/purchase/purchase.integration.spec.js` (PUR-TC-1..4).
- UI smoke: `tests/smoke/purchase/purchase.smoke.spec.js` (PUR-TC-5).

## GAPs (ver riesgos.yaml)
- **PUR-RISK-1**: dev sin customers con compras (escaneados 100) → lectura de compras reales
  (estados/pagos/facturas/detalle poblado) sin verificar. Cubierto solo contrato + estado vacío.
- **PUR-RISK-2**: escrituras (create/pay) fuera de alcance (gateways reales) — decisión, no bug.

## Selectores
`sm="div-purchases"` (contenedor) + `data-name="purchases-list"` / `payments-list` (tablas).
data-name es contrato estable de facto (CLAUDE.md). Cosechado en vivo 2026-07-14.
