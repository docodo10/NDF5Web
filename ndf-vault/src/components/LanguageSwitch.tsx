"use client";

import clsx from "clsx";
import { useSyncExternalStore } from "react";
import { getLang, LANGS, setLang, subscribeLang, type Lang } from "@/lib/i18n";

/**
 * English or French. Works without the vault's state, so it can sit on the
 * lock screen as well as in the application.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang);
  return (
    // Named in both languages: whoever looks for it reads at least one of them.
    <div role="group" aria-label="Language / Langue" data-language-switch className={clsx("inline-flex h-8 shrink-0 items-center rounded-lg border border-line bg-white p-0.5 shadow-xs", className)}>
      {LANGS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          lang={id}
          aria-pressed={lang === id}
          title={label}
          onClick={() => setLang(id as Lang)}
          className={clsx("flex h-7 items-center rounded-md px-2 text-[12px] font-semibold uppercase tracking-[0.04em] transition-colors duration-150", lang === id ? "bg-ink text-white" : "text-neutral-500 hover:text-ink")}
        >
          <span aria-hidden>{id}</span>
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
