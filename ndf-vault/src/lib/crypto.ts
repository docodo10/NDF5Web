/**
 * Encryption for the vault, built on the browser's Web Crypto API.
 *
 * A random 256-bit data key encrypts everything that is stored (AES-GCM, a
 * fresh nonce per record). The data key itself is stored wrapped by a key
 * derived from the passphrase (PBKDF2-SHA-256). Changing the passphrase only
 * re-wraps the data key; nothing else has to be re-encrypted.
 *
 * What this protects: data at rest. Someone with the device or a copy of the
 * browser profile cannot read the vault without the passphrase. It does not
 * protect a session that is already unlocked, and a forgotten passphrase
 * cannot be recovered.
 */

/** OWASP's current floor for PBKDF2-HMAC-SHA-256. */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 10;

const NONCE_BYTES = 12;
const SALT_BYTES = 16;

/** What is stored, in clear, to get the data key back from the passphrase. */
export interface KeyEnvelope {
  v: 1;
  salt: string;
  iterations: number;
  /** Nonce followed by the AES-GCM encrypted data key, base64. */
  wrapped: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("wrong passphrase");
    this.name = "WrongPassphraseError";
  }
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof crypto.getRandomValues === "function";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** The same passphrase typed with different Unicode forms must give the same key. */
function passphraseBytes(passphrase: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(passphrase.normalize("NFKC"));
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", passphraseBytes(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Import raw key bytes as a non-extractable data key, then wipe the bytes. */
async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

async function wrap(raw: Uint8Array<ArrayBuffer>, passphrase: string, iterations: number): Promise<KeyEnvelope> {
  const salt = random(SALT_BYTES);
  const nonce = random(NONCE_BYTES);
  const kek = await deriveWrappingKey(passphrase, salt, iterations);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, kek, raw));
  const wrapped = new Uint8Array(nonce.length + sealed.length);
  wrapped.set(nonce);
  wrapped.set(sealed, nonce.length);
  return { v: 1, salt: toBase64(salt), iterations, wrapped: toBase64(wrapped) };
}

async function unwrap(passphrase: string, envelope: KeyEnvelope): Promise<Uint8Array<ArrayBuffer>> {
  const wrapped = fromBase64(envelope.wrapped);
  const kek = await deriveWrappingKey(passphrase, fromBase64(envelope.salt), envelope.iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapped.subarray(0, NONCE_BYTES) }, kek, wrapped.subarray(NONCE_BYTES)));
  } catch {
    // AES-GCM authentication failed: the derived key is not the one that sealed the data key.
    throw new WrongPassphraseError();
  }
}

/** Start protecting a vault: a fresh data key, wrapped by the passphrase. */
export async function createEnvelope(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<{ envelope: KeyEnvelope; key: CryptoKey }> {
  const raw = random(32);
  const envelope = await wrap(raw, passphrase, iterations);
  return { envelope, key: await importDataKey(raw) };
}

/** Get the data key back. Throws WrongPassphraseError when the passphrase does not match. */
export async function openEnvelope(passphrase: string, envelope: KeyEnvelope): Promise<CryptoKey> {
  return importDataKey(await unwrap(passphrase, envelope));
}

/** Change the passphrase: the same data key, wrapped again under a new salt. */
export async function rewrapEnvelope(current: string, next: string, envelope: KeyEnvelope, iterations = PBKDF2_ITERATIONS): Promise<KeyEnvelope> {
  const raw = await unwrap(current, envelope);
  try {
    return await wrap(raw, next, iterations);
  } finally {
    raw.fill(0);
  }
}

/**
 * Encrypt bytes. `slot` names where the result is stored and is authenticated
 * with it, so a record copied over another one fails to decrypt.
 * Output: nonce followed by ciphertext and tag.
 */
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer | Uint8Array<ArrayBuffer>, slot: string): Promise<ArrayBuffer> {
  const nonce = random(NONCE_BYTES);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(slot) }, key, data));
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return out.buffer;
}

/** Decrypt what encryptBytes produced. Rejects when the data, the key or the slot does not match. */
export async function decryptBytes(key: CryptoKey, data: ArrayBuffer, slot: string): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, NONCE_BYTES), additionalData: encoder.encode(slot) }, key, bytes.subarray(NONCE_BYTES));
}

export async function encryptJson(key: CryptoKey, value: unknown, slot: string): Promise<ArrayBuffer> {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)), slot);
}

export async function decryptJson<T>(key: CryptoKey, data: ArrayBuffer, slot: string): Promise<T> {
  return JSON.parse(decoder.decode(await decryptBytes(key, data, slot))) as T;
}

/** SHA-256 of some content, as lowercase hex: the file's fingerprint. */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  let hex = "";
  for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, "0");
  return hex;
}

export interface Strength {
  /** 0 (unusable) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** What would make it stronger, in French; empty when it is fine. */
  hint: string;
}

const COMMON = ["password", "motdepasse", "azerty", "qwerty", "123456", "ndf5", "vault", "drago", "admin", "bonjour", "soleil", "letmein"];

/** A rough, honest strength estimate: length and variety count, common words and repeats do not. */
export function passphraseStrength(passphrase: string): Strength {
  const p = passphrase.normalize("NFKC");
  if (p.length === 0) return { score: 0, label: "", hint: "" };
  if (p.length < MIN_PASSPHRASE_LENGTH) return { score: 0, label: "Trop courte", hint: `Au moins ${MIN_PASSPHRASE_LENGTH} caractères.` };
  const lower = p.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const unique = new Set(p).size;
  let score = 1;
  if (p.length >= 14) score++;
  if (p.length >= 20) score++;
  if (classes >= 3) score++;
  if (unique < 6) score -= 2;
  else if (unique < 9) score--;
  if (COMMON.some((w) => lower.includes(w))) score--;
  if (/^(.)\1+$/.test(p) || /0123|1234|2345|3456|4567|5678|6789|abcd|azer|qwer/.test(lower)) score--;
  const s = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  const label = ["", "Faible", "Moyenne", "Bonne", "Forte"][s];
  const hint = s >= 3 ? "" : p.length < 14 ? "Allongez-la : plusieurs mots sans lien entre eux font une bonne phrase secrète." : "Évitez les mots courants et les suites, variez les caractères.";
  return { score: s, label, hint };
}
