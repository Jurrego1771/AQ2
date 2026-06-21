// @ts-check
const crypto = require('node:crypto');

/**
 * Generador TOTP (RFC 6238) en JS plano, sin dependencias — usa node:crypto.
 *
 * Las cuentas de qa/prod MANTIENEN 2FA habilitado (si se deshabilita, se
 * auto-bloquean tras una semana). El secreto base32 (la "setup key" que muestra
 * el QR del authenticator) se guarda por ambiente en TOTP_SECRET_<ENV>; aquí se
 * genera el código de 6 dígitos para el login automatizado.
 *
 * Verificado contra el vector de prueba de RFC 6238 (Appendix B):
 *   secret ASCII "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ),
 *   T=59s, SHA1, 6 dígitos -> "287082".
 */

/** Decodifica un secreto base32 (RFC 4648, sin padding obligatorio) a Buffer. */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`Carácter base32 inválido en TOTP secret: "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/**
 * Genera el código TOTP.
 * @param {string} secret base32 (TOTP_SECRET_<ENV>)
 * @param {object} [opts]
 * @param {number} [opts.timeMs] epoch ms (default: ahora)
 * @param {number} [opts.step] ventana en segundos (default 30)
 * @param {number} [opts.digits] dígitos (default 6)
 * @returns {string} código con padding a `digits`
 */
function generateTOTP(secret, { timeMs = Date.now(), step = 30, digits = 6 } = {}) {
  if (!secret) throw new Error('generateTOTP: secret base32 requerido');
  const key = base32Decode(secret);

  // Contador = floor(segundos / step), big-endian 8 bytes.
  let counter = Math.floor(timeMs / 1000 / step);
  const counterBuf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i -= 1) {
    counterBuf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  // Dynamic truncation (RFC 4226).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = bin % 10 ** digits;
  return String(code).padStart(digits, '0');
}

module.exports = { generateTOTP, base32Decode };
