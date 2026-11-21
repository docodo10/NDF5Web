import { scryptAsync } from "@noble/hashes/scrypt.js";
import { t } from "./i18n";

/**
 * Encryption for the vault, built on the browser's Web Crypto API.
 *
 * A random 256-bit data key encrypts everything that is stored (AES-GCM, a
 * fresh nonce per record). The data key itself is stored wrapped by a key
 * derived from the passphrase with scrypt, a memory-hard function: every
 * guess costs 64 MiB of memory as well as time, which is what makes guessing
 * on graphics cards expensive. Changing the passphrase only re-wraps the data
 * key; nothing else has to be re-encrypted.
 *
 * None of this relies on the code being secret. It is public; what is not is
 * the passphrase, and nothing derived from it is ever stored.
 *
 * What this protects: data at rest. Someone with the device or a copy of the
 * browser profile cannot read the vault without the passphrase. It does not
 * protect a session that is already unlocked. A forgotten passphrase cannot be
 * recovered, except with the recovery code: a second, random key to the same
 * data key, shown once and meant to be kept away from the device.
 */

/** OWASP's current floor for PBKDF2-HMAC-SHA-256. Vaults protected by earlier versions use it. */
export const PBKDF2_ITERATIONS = 600_000;

/** How a passphrase is turned into a key. */
export type Kdf = { kind: "pbkdf2"; iterations: number } | { kind: "scrypt"; n: number; r: number; p: number };

/** scrypt at one of OWASP's recommended settings: 64 MiB of memory, two passes. */
export const DEFAULT_KDF: Kdf = { kind: "scrypt", n: 2 ** 16, r: 8, p: 2 };

/** For a recovery code: 120 random bits need no stretching, only a key of the right shape. */
const CODE_KDF: Kdf = { kind: "pbkdf2", iterations: 100_000 };

/** A number is a PBKDF2 round count (what earlier versions and the tests pass); nothing means the default. */
const kdfOf = (cost?: number | Kdf): Kdf => (cost === undefined ? DEFAULT_KDF : typeof cost === "number" ? { kind: "pbkdf2", iterations: cost } : cost);
export const MIN_PASSPHRASE_LENGTH = 10;

const NONCE_BYTES = 12;
const SALT_BYTES = 16;

/** What is stored, in clear, to get the data key back from the passphrase. */
export interface KeyEnvelope {
  /** 1: PBKDF2 with `iterations` rounds. 2: scrypt with the cost in `scrypt`. */
  v: 1 | 2;
  salt: string;
  iterations: number;
  scrypt?: { n: number; r: number; p: number };
  /** Nonce followed by the AES-GCM encrypted data key, base64. */
  wrapped: string;
}

/** An envelope asks for more work than this page will do: refused rather than left to freeze the browser. */
export class UnsupportedEnvelopeError extends Error {
  constructor() {
    super("unsupported key envelope");
    this.name = "UnsupportedEnvelopeError";
  }
}

const powerOfTwo = (n: number) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;

/** How an envelope derives its key. Throws when its parameters are not ones this code would ever have written. */
export function envelopeKdf(envelope: KeyEnvelope): Kdf {
  if (envelope.v === 2) {
    const s = envelope.scrypt;
    // 128 * n * r bytes of memory: capped at 256 MiB, well above the default and far below what would stall a phone.
    if (!s || !powerOfTwo(s.n) || !Number.isInteger(s.r) || !Number.isInteger(s.p) || s.r < 1 || s.p < 1 || s.p > 16 || 128 * s.n * s.r > 2 ** 28) throw new UnsupportedEnvelopeError();
    return { kind: "scrypt", n: s.n, r: s.r, p: s.p };
  }
  if (envelope.v !== 1 || !Number.isInteger(envelope.iterations) || envelope.iterations < 1 || envelope.iterations > 5_000_000) throw new UnsupportedEnvelopeError();
  return { kind: "pbkdf2", iterations: envelope.iterations };
}

/** True for an envelope written by an earlier version at its full strength: worth re-wrapping with the current default. */
export function isLegacyEnvelope(envelope: KeyEnvelope): boolean {
  return envelope.v === 1 && envelope.iterations >= PBKDF2_ITERATIONS;
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

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, kdf: Kdf): Promise<CryptoKey> {
  if (kdf.kind === "scrypt") {
    const secret = passphraseBytes(passphrase);
    const raw = new Uint8Array(await scryptAsync(secret, salt, { N: kdf.n, r: kdf.r, p: kdf.p, dkLen: 32, maxmem: 2 ** 28 + 2 ** 20 }));
    try {
      return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    } finally {
      raw.fill(0);
      secret.fill(0);
    }
  }
  const material = await crypto.subtle.importKey("raw", passphraseBytes(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: kdf.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Import raw key bytes as a non-extractable data key, then wipe the bytes. */
async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

async function wrap(raw: Uint8Array<ArrayBuffer>, passphrase: string, kdf: Kdf): Promise<KeyEnvelope> {
  const salt = random(SALT_BYTES);
  const nonce = random(NONCE_BYTES);
  const kek = await deriveWrappingKey(passphrase, salt, kdf);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, kek, raw));
  const wrapped = new Uint8Array(nonce.length + sealed.length);
  wrapped.set(nonce);
  wrapped.set(sealed, nonce.length);
  return kdf.kind === "scrypt" ? { v: 2, salt: toBase64(salt), iterations: 0, scrypt: { n: kdf.n, r: kdf.r, p: kdf.p }, wrapped: toBase64(wrapped) } : { v: 1, salt: toBase64(salt), iterations: kdf.iterations, wrapped: toBase64(wrapped) };
}

async function unwrap(passphrase: string, envelope: KeyEnvelope): Promise<Uint8Array<ArrayBuffer>> {
  const wrapped = fromBase64(envelope.wrapped);
  const kek = await deriveWrappingKey(passphrase, fromBase64(envelope.salt), envelopeKdf(envelope));
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapped.subarray(0, NONCE_BYTES) }, kek, wrapped.subarray(NONCE_BYTES)));
  } catch {
    // AES-GCM authentication failed: the derived key is not the one that sealed the data key.
    throw new WrongPassphraseError();
  }
}

/** Start protecting a vault: a fresh data key, wrapped by the passphrase. */
export async function createEnvelope(passphrase: string, cost?: number | Kdf): Promise<{ envelope: KeyEnvelope; key: CryptoKey }> {
  const raw = random(32);
  const envelope = await wrap(raw, passphrase, kdfOf(cost));
  return { envelope, key: await importDataKey(raw) };
}

/** Get the data key back. Throws WrongPassphraseError when the passphrase does not match. */
export async function openEnvelope(passphrase: string, envelope: KeyEnvelope): Promise<CryptoKey> {
  return importDataKey(await unwrap(passphrase, envelope));
}

/** Change the passphrase: the same data key, wrapped again under a new salt. */
export async function rewrapEnvelope(current: string, next: string, envelope: KeyEnvelope, cost?: number | Kdf): Promise<KeyEnvelope> {
  const raw = await unwrap(current, envelope);
  try {
    return await wrap(raw, next, kdfOf(cost));
  } finally {
    raw.fill(0);
  }
}

/* ------------------------------------------------------------ Recovery code */

/** Crockford's base 32: no I, L, O or U, so a code copied by hand or read aloud survives. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 24; // 120 random bits

const grouped = (code: string) => code.match(/.{4}/g)!.join("-");

/** A fresh recovery code, as shown to the person: six groups of four characters. */
export function generateRecoveryCode(): string {
  const bytes = random((CODE_LENGTH * 5) / 8);
  let acc = 0;
  let bits = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return grouped(out);
}

/** What was typed, brought back to the code's exact form; null when it cannot be a code. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s\-_.·–—]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== CODE_LENGTH) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return grouped(s);
}

/** Create a recovery code for a vault: the same data key, wrapped a second time under the code. Needs the passphrase. */
export async function createRecovery(passphrase: string, envelope: KeyEnvelope, cost?: number | Kdf): Promise<{ code: string; recovery: KeyEnvelope }> {
  const raw = await unwrap(passphrase, envelope);
  try {
    const code = generateRecoveryCode();
    return { code, recovery: await wrap(raw, code, cost === undefined ? CODE_KDF : kdfOf(cost)) };
  } finally {
    raw.fill(0);
  }
}

/**
 * Use a recovery code to set a new passphrase. The code has now been typed
 * into a device, so it is replaced: a new one comes back with the new envelope.
 * Throws WrongPassphraseError when the code does not match.
 */
export async function recoverEnvelope(code: string, recovery: KeyEnvelope, nextPassphrase: string, cost?: number | Kdf): Promise<{ envelope: KeyEnvelope; code: string; recovery: KeyEnvelope }> {
  const typed = normalizeRecoveryCode(code);
  if (!typed) throw new WrongPassphraseError();
  const raw = await unwrap(typed, recovery);
  try {
    const next = generateRecoveryCode();
    return { envelope: await wrap(raw, nextPassphrase, kdfOf(cost)), code: next, recovery: await wrap(raw, next, cost === undefined ? CODE_KDF : kdfOf(cost)) };
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
  if (p.length < MIN_PASSPHRASE_LENGTH) return { score: 0, label: t("Trop courte", "Too short"), hint: t(`Au moins ${MIN_PASSPHRASE_LENGTH} caractères.`, `At least ${MIN_PASSPHRASE_LENGTH} characters.`) };
  const lower = p.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const unique = new Set(p).size;
  let score = 1;
  if (p.length >= 14) score++;
  if (p.length >= 20) score++;
  if (p.length >= 28) score++;
  if (classes >= 3) score++;
  if (unique < 6) score -= 2;
  else if (unique < 9) score--;
  if (COMMON.some((w) => lower.includes(w))) score--;
  if (/^(.)\1+$/.test(p) || /0123|1234|2345|3456|4567|5678|6789|abcd|azer|qwer/.test(lower)) score--;
  const s = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  const label = ["", t("Faible", "Weak"), t("Moyenne", "Fair"), t("Bonne", "Good"), t("Forte", "Strong")][s];
  const hint = s >= 3 ? "" : p.length < 14 ? t("Allongez-la : plusieurs mots sans lien entre eux font une bonne phrase secrète.", "Make it longer: several unrelated words make a good passphrase.") : t("Évitez les mots courants et les suites, variez les caractères.", "Avoid common words and sequences, vary the characters.");
  return { score: s, label, hint };
}

/* ------------------------------------------------------ Suggested passphrase */

const CONSONANTS = "bdfgjklmnprstvz";
const VOWELS = "aeiou";

/** One character of an alphabet, every character equally likely. */
function pick(alphabet: string): string {
  // Bytes above the largest multiple of the alphabet's length would favor its first letters: drawn again.
  const limit = 256 - (256 % alphabet.length);
  for (;;) {
    const [byte] = random(1);
    if (byte < limit) return alphabet[byte % alphabet.length];
  }
}

/** The strength of a suggested passphrase, in bits: what an attacker who knows exactly how it is made must still guess. */
export const suggestedBits = (groups = 5) => Math.floor(groups * 3 * Math.log2(CONSONANTS.length * VOWELS.length));

/**
 * A passphrase nobody would choose and anyone can say aloud: groups of three
 * syllables, such as "movida-kurelo-tabise-nofalu-ridemo". Five groups are
 * worth about 93 bits, far beyond what guessing can reach.
 */
export function generatePassphrase(groups = 5): string {
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let word = "";
    for (let s = 0; s < 3; s++) word += pick(CONSONANTS) + pick(VOWELS);
    out.push(word);
  }
  return out.join("-");
}
