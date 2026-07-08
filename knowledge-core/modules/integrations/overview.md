# Integrations — Overview estructural (mapa del módulo)

> Pantalla de integraciones de la cuenta (`/settings/integrations`): pagos (Stripe,
> Ventipay, MercadoPago, PayPal, Kushki, Cielo, GooglePay, Apple Store, InComm…),
> peering (System73), metadata (Gracenote), etc. Cobertura QA acotada por ahora a la
> integración **Stripe** (motivada por el PR mediastream/sm2#8481). Conocimiento
> **estructural** aquí; el **comportamiento** vive en `historias.yaml` (AC) y `riesgos.yaml`.

Prefijo de IDs: **INTG** · Épica: `integrations-management`. Entorno verificado: dev, v7.0.70.

## Ruta y persistencia
- Vista: `/settings/integrations` (`views/settings/integrations.coffee`, client
  `src/client/settings/integrations.coffee`). Requiere permisos admin/account-admin.
- Guardado: `POST /api/account` con todos los params de integraciones (un único save).
  El schema de cuenta valida en `pre('save')` y devuelve `400 STRIPE_API_KEY_REQUIRED`
  si Stripe está activo sin key (server-side, ya existente).

## Stripe (foco de cobertura, PR sm2#8481 — ya desplegado en dev)
- **Placeholder** del Secret Key: `example: sk_live_xxxxxxxxxxxxxxxxxxxxxxxx` (antes era un
  token de forma real, inducía a activar sin cargar la key).
- **Validación cliente** en `save()`: si `stripe.enabled && api_key === ''` → warning
  `"A Stripe API Key is required to enable this integration."` y **corta antes del POST**.
- **Handler `.always`**: mapea `400 STRIPE_API_KEY_REQUIRED` al mismo mensaje específico.

## Marcas sm: (cosechadas en vivo)
- Estables y usadas por el POM: `[sm="save"]` (guardar), `[sm="global-alert"]` (warnings/errores).
- **Faltan en Stripe (bug AQ2#39)**: el toggle y el input usan solo `data-name`
  (`payments-stripe-enabled`, `payments-stripe-api-key`). Contraste: System73 sí expone
  `[sm="system73-api-key"]`, `[sm="system73-enabled-live"]`, `[sm="system73-enabled-vod"]`.
  El POM usa `data-name` para Stripe como **excepción documentada** (precedente: Media AQ2#11).

## Estado de cobertura
- **UI Stripe** (verde, anti-regresión): INTG-TC-1 (placeholder) e INTG-TC-2 (warning + no-POST).
- **GAPs**: contrato server-side `STRIPE_API_KEY_REQUIRED` no se prueba por API (POST /api/account
  mutaría la cuenta compartida de dev; el guard cliente ya impide alcanzarlo por UI). El resto de
  integraciones de la pantalla (Ventipay, MercadoPago, System73, Gracenote…) sin explorar.
- **Seguridad de la prueba**: INTG-TC-2 deja Stripe activo + key vacía y guarda; el guard bloquea
  el POST → no persiste nada (verificado: tras recargar, el estado del servidor no cambia).

## Precondiciones
- Sesión con permisos admin/account-admin. En dev el campo Stripe tenía un valor de prueba
  ("asdasd") y Stripe activado; los tests no dependen de ese estado (lo fijan en el form sin guardar).
