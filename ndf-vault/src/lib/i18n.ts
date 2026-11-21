/**
 * The two languages of the vault.
 *
 * English is the default: most people who open the vault read English.
 * Someone who arrives from the French side of the site gets French (the link
 * carries `?lang=fr`), and anyone can switch at any time; the choice is
 * remembered on the device.
 *
 * Every piece of interface text is written in both languages where it is
 * used, as `t("Téléverser", "Upload")`: there is no table of keys to keep in
 * step, and a missing translation cannot exist.
 */

export type Lang = "en" | "fr";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
];

const KEY = "ndf-vault-lang";

let current: Lang = "en";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

/** Be told when the language changes. Returns the function that stops it. */
export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function parseLang(value: unknown): Lang | null {
  const v = typeof value === "string" ? value.trim().toLowerCase().slice(0, 2) : "";
  return v === "fr" || v === "en" ? v : null;
}

/** The text for the current language. French first, as it was written first; English second. */
export function t<T>(fr: T, en: T): T {
  return current === "fr" ? fr : en;
}

/**
 * A table of labels that always answers in the current language:
 * `localized({ pdf: ["PDF", "PDF"], docx: ["Document", "Document"] }).docx`.
 * For labels defined once at the top of a file, which a plain object would
 * freeze in whatever language was current when the file loaded.
 */
export function localized<K extends string>(labels: Record<K, readonly [fr: string, en: string]>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(labels) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => labels[key][current === "fr" ? 0 : 1] });
  }
  return out;
}

function apply(lang: Lang): void {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang === "fr" ? "fr-CA" : "en";
}

/** Switch language, remember it, and keep the address in step so that a reload does not undo the choice. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  apply(lang);
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage refused: the choice lasts for this visit */
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", lang);
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    /* an address that cannot be rewritten (a sandboxed frame) is left alone */
  }
  for (const listener of listeners) listener();
}

/**
 * The language to start in: the side of the site the person arrived from
 * (`?lang=fr` or `?lang=en` in the address), else what they chose before on
 * this device, else English.
 */
export function initLang(): Lang {
  let lang: Lang | null = null;
  try {
    lang = parseLang(new URLSearchParams(window.location.search).get("lang"));
  } catch {
    /* no address to read */
  }
  if (!lang) {
    try {
      lang = parseLang(localStorage.getItem(KEY));
    } catch {
      /* storage refused */
    }
  }
  apply(lang ?? "en");
  return current;
}

if (typeof window !== "undefined") initLang();

/** For tests: set the language without touching storage or the address. */
export function setLangForTests(lang: Lang): void {
  apply(lang);
  for (const listener of listeners) listener();
}
