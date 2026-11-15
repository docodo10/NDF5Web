import { describe, expect, it } from "vitest";
import {
  createEnvelope,
  DEFAULT_KDF,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  envelopeKdf,
  generatePassphrase,
  isLegacyEnvelope,
  openEnvelope,
  passphraseStrength,
  PBKDF2_ITERATIONS,
  rewrapEnvelope,
  sha256Hex,
  suggestedBits,
  UnsupportedEnvelopeError,
  WrongPassphraseError,
} from "@/lib/crypto";

const FAST = 1000; // PBKDF2 rounds for tests; the app default is checked separately
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

describe("key envelope", () => {
  it("opens with the right passphrase and gives a working key", async () => {
    const { envelope, key } = await createEnvelope("correct horse battery staple", FAST);
    const sealed = await encryptBytes(key, bytes("secret"), "slot");
    const again = await openEnvelope("correct horse battery staple", envelope);
    expect(text(await decryptBytes(again, sealed, "slot"))).toBe("secret");
  });

  it("refuses a wrong passphrase", async () => {
    const { envelope } = await createEnvelope("correct horse battery staple", FAST);
    await expect(openEnvelope("correct horse battery stapl", envelope)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(openEnvelope("", envelope)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("treats two Unicode spellings of the same passphrase as one", async () => {
    const composed = "caf\u00e9 du matin"; // é as one code point
    const decomposed = "cafe\u0301 du matin"; // e + combining accent
    const { envelope } = await createEnvelope(composed, FAST);
    await expect(openEnvelope(decomposed, envelope)).resolves.toBeDefined();
  });

  it("never stores the passphrase or the key in the envelope", async () => {
    const { envelope } = await createEnvelope("correct horse battery staple", FAST);
    expect(JSON.stringify(envelope)).not.toContain("correct horse");
    expect(Object.keys(envelope).sort()).toEqual(["iterations", "salt", "v", "wrapped"]);
  });

  it("uses a fresh salt and a fresh key every time", async () => {
    const a = await createEnvelope("same passphrase here", FAST);
    const b = await createEnvelope("same passphrase here", FAST);
    expect(a.envelope.salt).not.toBe(b.envelope.salt);
    expect(a.envelope.wrapped).not.toBe(b.envelope.wrapped);
    const sealed = await encryptBytes(a.key, bytes("x"), "slot");
    await expect(decryptBytes(b.key, sealed, "slot")).rejects.toThrow();
  });

  it("makes the data key non-extractable", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("derives the key with memory-hard scrypt by default, at a recommended cost", async () => {
    const { envelope, key } = await createEnvelope("correct horse battery staple");
    expect(envelope.v).toBe(2);
    // 128 × N × r bytes: 64 MiB per guess, twice over.
    expect(envelope.scrypt).toEqual({ n: 65536, r: 8, p: 2 });
    expect(DEFAULT_KDF).toEqual({ kind: "scrypt", n: 65536, r: 8, p: 2 });
    const sealed = await encryptBytes(key, bytes("secret"), "x");
    expect(text(await decryptBytes(await openEnvelope("correct horse battery staple", envelope), sealed, "x"))).toBe("secret");
    await expect(openEnvelope("correct horse battery stapler", envelope)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("still opens the envelopes earlier versions wrote, and knows them for what they are", async () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const old = await createEnvelope("correct horse battery staple", { kind: "pbkdf2", iterations: PBKDF2_ITERATIONS });
    expect(old.envelope).toMatchObject({ v: 1, iterations: PBKDF2_ITERATIONS });
    expect(isLegacyEnvelope(old.envelope)).toBe(true);
    await expect(openEnvelope("correct horse battery staple", old.envelope)).resolves.toBeTruthy();
    expect(isLegacyEnvelope((await createEnvelope("x".repeat(12))).envelope)).toBe(false);
    expect(isLegacyEnvelope((await createEnvelope("x".repeat(12), FAST)).envelope)).toBe(false);
  });

  it("refuses an envelope that asks for more work or memory than it would ever have written", async () => {
    const { envelope } = await createEnvelope("correct horse battery staple", { kind: "scrypt", n: 1024, r: 8, p: 1 });
    const bad = [
      { ...envelope, scrypt: { n: 2 ** 24, r: 8, p: 1 } }, // 16 GiB
      { ...envelope, scrypt: { n: 1000, r: 8, p: 1 } }, // not a power of two
      { ...envelope, scrypt: { n: 1024, r: 8, p: 500 } },
      { ...envelope, scrypt: { n: 1024, r: 0, p: 1 } },
      { ...envelope, scrypt: undefined },
      { ...envelope, v: 1 as const, iterations: 2_000_000_000 },
      { ...envelope, v: 1 as const, iterations: 0 },
      { ...envelope, v: 3 as unknown as 2 },
    ];
    for (const e of bad) {
      expect(() => envelopeKdf(e), JSON.stringify(e.scrypt ?? e.iterations)).toThrow(UnsupportedEnvelopeError);
      await expect(openEnvelope("correct horse battery staple", e)).rejects.toBeInstanceOf(UnsupportedEnvelopeError);
    }
    expect(envelopeKdf(envelope)).toEqual({ kind: "scrypt", n: 1024, r: 8, p: 1 });
  });
});

describe("changing the passphrase", () => {
  it("keeps the data readable with the new passphrase only", async () => {
    const { envelope, key } = await createEnvelope("the old passphrase", FAST);
    const sealed = await encryptBytes(key, bytes("kept"), "slot");
    const next = await rewrapEnvelope("the old passphrase", "the new passphrase", envelope, FAST);
    expect(text(await decryptBytes(await openEnvelope("the new passphrase", next), sealed, "slot"))).toBe("kept");
    await expect(openEnvelope("the old passphrase", next)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("refuses when the current passphrase is wrong", async () => {
    const { envelope } = await createEnvelope("the old passphrase", FAST);
    await expect(rewrapEnvelope("not it", "the new passphrase", envelope, FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});

describe("encryption", () => {
  it("round-trips bytes and JSON", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    const data = new Uint8Array(200_000).map((_, i) => (i * 31 + 7) % 256);
    expect(new Uint8Array(await decryptBytes(key, await encryptBytes(key, data, "a"), "a"))).toEqual(data);
    const value = { files: [{ name: "Contrat é" }], n: 3 };
    expect(await decryptJson(key, await encryptJson(key, value, "state"), "state")).toEqual(value);
  });

  it("does not leave the plaintext in the output", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    const sealed = new Uint8Array(await encryptJson(key, { name: "Contrat confidentiel" }, "state"));
    expect(new TextDecoder("latin1").decode(sealed)).not.toContain("Contrat confidentiel");
  });

  it("gives a different ciphertext each time", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    const a = new Uint8Array(await encryptBytes(key, bytes("same"), "slot"));
    const b = new Uint8Array(await encryptBytes(key, bytes("same"), "slot"));
    expect(a).not.toEqual(b);
  });

  it("detects a single flipped bit", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    const sealed = new Uint8Array(await encryptBytes(key, bytes("do not touch"), "slot"));
    for (const at of [0, 12, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[at] ^= 1;
      await expect(decryptBytes(key, tampered.buffer, "slot")).rejects.toThrow();
    }
  });

  it("refuses a record moved to another slot", async () => {
    const { key } = await createEnvelope("correct horse battery staple", FAST);
    const sealed = await encryptBytes(key, bytes("for file A"), "blob:a");
    await expect(decryptBytes(key, sealed, "blob:b")).rejects.toThrow();
  });
});

describe("fingerprint", () => {
  it("matches the known SHA-256 vectors", async () => {
    expect(await sha256Hex(bytes("abc").buffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex(new Blob([]))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("passphrase strength", () => {
  it("rejects short passphrases outright", () => {
    expect(passphraseStrength("").score).toBe(0);
    expect(passphraseStrength("court").score).toBe(0);
    expect(passphraseStrength("Aa1!Aa1!x").score).toBe(0);
  });

  it("rates common or repetitive passphrases as weak", () => {
    expect(passphraseStrength("password123456").score).toBeLessThanOrEqual(2);
    expect(passphraseStrength("aaaaaaaaaaaaaaaa").score).toBe(1);
    expect(passphraseStrength("ndf5vault2026").score).toBeLessThanOrEqual(2);
  });

  it("rates a long varied phrase as strong", () => {
    expect(passphraseStrength("Girafe-Violette_42 boit du thé").score).toBe(4);
    expect(passphraseStrength("tortue lampe orage fenêtre").score).toBeGreaterThanOrEqual(3);
  });
});

describe("suggested passphrase", () => {
  it("is five groups of three syllables, different every time", () => {
    const phrases = Array.from({ length: 300 }, () => generatePassphrase());
    for (const p of phrases) expect(p).toMatch(/^([bdfgjklmnprstvz][aeiou]){3}(-([bdfgjklmnprstvz][aeiou]){3}){4}$/);
    expect(new Set(phrases).size).toBe(300);
  });

  it("uses every letter about as often as any other", () => {
    const text = Array.from({ length: 2000 }, () => generatePassphrase()).join("").replace(/-/g, "");
    const counts = new Map<string, number>();
    for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1);
    // 30,000 consonants over 15 letters and 30,000 vowels over 5: each within a fifth of its share.
    for (const c of "bdfgjklmnprstvz") expect(Math.abs((counts.get(c) ?? 0) - 2000), c).toBeLessThan(400);
    for (const c of "aeiou") expect(Math.abs((counts.get(c) ?? 0) - 6000), c).toBeLessThan(1200);
  });

  it("is worth about 93 bits and rates as strong", () => {
    expect(suggestedBits()).toBe(93);
    expect(suggestedBits(3)).toBe(56);
    expect(passphraseStrength(generatePassphrase()).score).toBe(4);
  });
});
