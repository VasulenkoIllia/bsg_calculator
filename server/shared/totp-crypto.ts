/**
 * Phase 8 Stage 2 — AES-256-GCM encryption for TOTP secrets at rest.
 *
 * The per-user TOTP secret (base32) is the long-lived credential behind
 * 2FA — a DB breach that leaks it lets an attacker mint valid codes
 * forever. So we encrypt it with a server-held key (`TOTP_ENCRYPTION_KEY`,
 * 32 bytes) that lives ONLY in the environment, never in the DB. GCM
 * gives confidentiality + integrity (the auth tag detects tampering).
 *
 * Wire format (all hex): `<nonce:24 hex><ciphertext:N hex><tag:32 hex>`
 *   - nonce  = 12 bytes (96-bit, the GCM-recommended size) → 24 hex
 *   - tag    = 16 bytes (128-bit auth tag)                 → 32 hex
 * A fresh random nonce per encryption means the same secret encrypts to
 * a different ciphertext each time (semantic security).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const NONCE_HEX = NONCE_BYTES * 2;
const TAG_HEX = TAG_BYTES * 2;

function key(): Buffer {
  // env validates the 64-hex shape; Buffer is exactly 32 bytes.
  return Buffer.from(env.TOTP_ENCRYPTION_KEY, "hex");
}

/** Encrypt a plaintext TOTP secret. Returns the hex wire format. */
export function encryptTotpSecret(plaintext: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return nonce.toString("hex") + ciphertext.toString("hex") + tag.toString("hex");
}

/**
 * Decrypt a value produced by {@link encryptTotpSecret}. Throws if the
 * wire format is malformed or the auth tag fails (tampered / wrong key).
 */
export function decryptTotpSecret(encrypted: string): string {
  if (encrypted.length < NONCE_HEX + TAG_HEX) {
    throw new Error("[totp-crypto] ciphertext too short / malformed");
  }
  const nonce = Buffer.from(encrypted.slice(0, NONCE_HEX), "hex");
  const tag = Buffer.from(encrypted.slice(encrypted.length - TAG_HEX), "hex");
  const ciphertext = Buffer.from(
    encrypted.slice(NONCE_HEX, encrypted.length - TAG_HEX),
    "hex"
  );
  const decipher = createDecipheriv(ALGORITHM, key(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
