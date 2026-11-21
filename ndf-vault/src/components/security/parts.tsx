"use client";

import clsx from "clsx";
import { Check, Copy, Download, Sparkles } from "lucide-react";
import { useState } from "react";
import { generatePassphrase, MIN_PASSPHRASE_LENGTH, passphraseStrength, suggestedBits } from "@/lib/crypto";
import { formatMoment } from "@/lib/format";
import { t } from "@/lib/i18n";
import { saveToDisk } from "@/lib/uploads";
import { Field, PassphraseInput } from "../dialog-kit";
import { Button } from "../ui";

/**
 * Pieces shared by the security dialogs and the lock screen. None of them
 * reads the vault's state, so they also work while the vault is locked.
 */

/** Copy something secret, and take it off the clipboard again a minute later. */
async function copySecret(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    setTimeout(() => void navigator.clipboard.writeText("").catch(() => {}), 60_000);
    return true;
  } catch {
    return false;
  }
}

const BAR = ["bg-neutral-200", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const s = passphraseStrength(passphrase);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={clsx("h-1 flex-1 rounded-full transition-colors duration-200", passphrase && s.score >= n ? BAR[s.score] : "bg-neutral-200")} />
        ))}
      </div>
      <p className="mt-1.5 min-h-[18px] text-[12px] text-neutral-500">
        {s.label && <span className="font-medium text-neutral-700">{s.label}. </span>}
        {s.hint}
      </p>
    </div>
  );
}

/** A new passphrase, typed twice. Valid once it is long enough, not weak, and both entries match. */
export function NewPassphrase({ value, onChange, confirm, onConfirm, idPrefix, autoFocus, label = t("Nouvelle phrase secrète", "New passphrase") }: { value: string; onChange: (v: string) => void; confirm: string; onConfirm: (v: string) => void; idPrefix: string; autoFocus?: boolean; label?: string }) {
  const mismatch = confirm.length > 0 && confirm !== value;
  const [suggested, setSuggested] = useState("");
  const [copied, setCopied] = useState(false);
  const suggest = () => {
    const phrase = generatePassphrase();
    setSuggested(phrase);
    setCopied(false);
    onChange(phrase);
    // Typed again by hand: the point of the second field is to prove the phrase was taken down.
    onConfirm("");
  };
  return (
    <>
      <Field label={label} hint={t(`Au moins ${MIN_PASSPHRASE_LENGTH} caractères. Plusieurs mots sans lien entre eux font une bonne phrase.`, `At least ${MIN_PASSPHRASE_LENGTH} characters. Several unrelated words make a good passphrase.`)}>
        <PassphraseInput id={`${idPrefix}-new`} value={value} onChange={onChange} autoComplete="new-password" autoFocus={autoFocus} />
        <StrengthMeter passphrase={value} />
        {suggested && suggested === value ? (
          <div data-suggested className="mt-1 rounded-[10px] border border-line bg-subtle px-3 py-2.5">
            <p className="select-all break-words font-mono text-[14px] font-semibold tracking-[0.01em] text-ink">{suggested}</p>
            <p className="mt-1 text-[12px] leading-[17px] text-neutral-500">{t(`Tirée au hasard, environ ${suggestedBits()} bits : hors de portée d’une recherche par essais. Notez-la, puis retapez-la ci-dessous.`, `Picked at random, about ${suggestedBits()} bits: out of reach of a trial-and-error search. Write it down, then retype it below.`)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" icon={copied ? Check : Copy} onClick={async () => setCopied(await copySecret(suggested))}>
                {copied ? t("Copiée · effacée du presse-papiers dans 1 min", "Copied · cleared from the clipboard in 1 min") : t("Copier", "Copy")}
              </Button>
              <Button size="sm" icon={Sparkles} onClick={suggest}>
                {t("Une autre", "Another one")}
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" id={`${idPrefix}-suggest`} onClick={suggest} className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-600 underline-offset-2 hover:text-ink hover:underline">
            <Sparkles className="size-3.5" strokeWidth={1.75} /> {t("Proposer une phrase forte", "Suggest a strong passphrase")}
          </button>
        )}
      </Field>
      <Field label={t("Confirmez-la", "Confirm it")}>
        <PassphraseInput id={`${idPrefix}-confirm`} value={confirm} onChange={onConfirm} autoComplete="new-password" />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {mismatch ? t("Les deux saisies ne correspondent pas.", "The two entries do not match.") : ""}
        </p>
      </Field>
    </>
  );
}

export const acceptable = (value: string, confirm: string) => passphraseStrength(value).score >= 2 && value === confirm;

/**
 * The recovery code, shown once. It can be copied or saved as a text file;
 * after this screen it exists nowhere in readable form.
 */
export function RecoveryCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  // The code stays selectable on screen when the clipboard is refused.
  const copy = async () => setCopied(await copySecret(code));
  const save = () => {
    const text = t(
      `NDF Vault — code de récupération\r\n\r\n${code}\r\n\r\nCréé le ${formatMoment(new Date())}.\r\nCe code permet de choisir une nouvelle phrase secrète si la vôtre est oubliée.\r\nGardez-le hors de l’appareil qui contient le Vault.\r\n`,
      `NDF Vault — recovery code\r\n\r\n${code}\r\n\r\nCreated on ${formatMoment(new Date())}.\r\nThis code lets you choose a new passphrase if you forget yours.\r\nKeep it off the device that holds the Vault.\r\n`,
    );
    void saveToDisk(t("code-de-recuperation-ndf-vault.txt", "ndf-vault-recovery-code.txt"), new Blob([text], { type: "text/plain" }));
  };
  return (
    <div className="rounded-xl border border-line bg-subtle px-4 py-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500">{t("Code de récupération", "Recovery code")}</p>
      <p data-recovery-code className="mt-2 select-all break-words font-mono text-[17px] font-semibold leading-7 tracking-[0.02em] text-ink">
        {code}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? t("Copié · effacé du presse-papiers dans 1 min", "Copied · cleared from the clipboard in 1 min") : t("Copier", "Copy")}
        </Button>
        <Button size="sm" icon={Download} onClick={save}>
          {t("Enregistrer (.txt)", "Save (.txt)")}
        </Button>
      </div>
    </div>
  );
}

/** "I wrote it down": the box to tick before the code leaves the screen. */
export function NotedCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5">
      <input id="recovery-noted" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-black" />
      <span className="text-[12.5px] leading-[18px] text-neutral-700">
        {t(
          <>J’ai noté ce code dans un endroit sûr, <span className="font-medium text-ink">hors de cet appareil</span>. Il ne sera plus affiché.</>,
          <>I have written this code down in a safe place, <span className="font-medium text-ink">off this device</span>. It will not be shown again.</>,
        )}
      </span>
    </label>
  );
}
