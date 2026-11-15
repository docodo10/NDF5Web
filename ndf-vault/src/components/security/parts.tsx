"use client";

import clsx from "clsx";
import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { MIN_PASSPHRASE_LENGTH, passphraseStrength } from "@/lib/crypto";
import { formatMoment } from "@/lib/format";
import { saveToDisk } from "@/lib/uploads";
import { Field, PassphraseInput } from "../dialog-kit";
import { Button } from "../ui";

/**
 * Pieces shared by the security dialogs and the lock screen. None of them
 * reads the vault's state, so they also work while the vault is locked.
 */

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
export function NewPassphrase({ value, onChange, confirm, onConfirm, idPrefix, autoFocus, label = "Nouvelle phrase secrète" }: { value: string; onChange: (v: string) => void; confirm: string; onConfirm: (v: string) => void; idPrefix: string; autoFocus?: boolean; label?: string }) {
  const mismatch = confirm.length > 0 && confirm !== value;
  return (
    <>
      <Field label={label} hint={`Au moins ${MIN_PASSPHRASE_LENGTH} caractères. Plusieurs mots sans lien entre eux font une bonne phrase.`}>
        <PassphraseInput id={`${idPrefix}-new`} value={value} onChange={onChange} autoComplete="new-password" autoFocus={autoFocus} />
        <StrengthMeter passphrase={value} />
      </Field>
      <Field label="Confirmez-la">
        <PassphraseInput id={`${idPrefix}-confirm`} value={confirm} onChange={onConfirm} autoComplete="new-password" />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {mismatch ? "Les deux saisies ne correspondent pas." : ""}
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the code stays selectable on screen */
    }
  };
  const save = () => {
    const text = `NDF Vault — code de récupération\r\n\r\n${code}\r\n\r\nCréé le ${formatMoment(new Date())}.\r\nCe code permet de choisir une nouvelle phrase secrète si la vôtre est oubliée.\r\nGardez-le hors de l’appareil qui contient le Vault.\r\n`;
    void saveToDisk("code-de-recuperation-ndf-vault.txt", new Blob([text], { type: "text/plain" }));
  };
  return (
    <div className="rounded-xl border border-line bg-subtle px-4 py-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-neutral-500">Code de récupération</p>
      <p data-recovery-code className="mt-2 select-all break-words font-mono text-[17px] font-semibold leading-7 tracking-[0.02em] text-ink">
        {code}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button size="sm" icon={Download} onClick={save}>
          Enregistrer (.txt)
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
        J’ai noté ce code dans un endroit sûr, <span className="font-medium text-ink">hors de cet appareil</span>. Il ne sera plus affiché.
      </span>
    </label>
  );
}
