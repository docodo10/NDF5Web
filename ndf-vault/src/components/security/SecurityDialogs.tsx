"use client";

import clsx from "clsx";
import { useState } from "react";
import { useVault } from "@/lib/store";
import { MIN_PASSPHRASE_LENGTH, passphraseStrength } from "@/lib/crypto";
import { Field, Modal, Note, PassphraseInput } from "../dialog-kit";
import { Button } from "../ui";

const BAR = ["bg-neutral-200", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

function StrengthMeter({ passphrase }: { passphrase: string }) {
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
function NewPassphrase({ value, onChange, confirm, onConfirm, idPrefix, autoFocus }: { value: string; onChange: (v: string) => void; confirm: string; onConfirm: (v: string) => void; idPrefix: string; autoFocus?: boolean }) {
  const mismatch = confirm.length > 0 && confirm !== value;
  return (
    <>
      <Field label="Nouvelle phrase secrète" hint={`Au moins ${MIN_PASSPHRASE_LENGTH} caractères. Plusieurs mots sans lien entre eux font une bonne phrase.`}>
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

const acceptable = (value: string, confirm: string) => passphraseStrength(value).score >= 2 && value === confirm;

export function ProtectDialog() {
  const { enableProtection, openDialog } = useVault();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = acceptable(value, confirm) && understood && !busy;
  return (
    <Modal
      title="Protéger le Vault"
      description="Tout ce qui est stocké sera chiffré avec votre phrase secrète."
      width={480}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        await enableProtection(value);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? "Chiffrement…" : "Activer la protection"}
          </Button>
        </>
      }
    >
      <NewPassphrase value={value} onChange={setValue} confirm={confirm} onConfirm={setConfirm} idPrefix="protect" autoFocus />
      <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5">
        <input id="protect-understood" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-black" />
        <span className="text-[12.5px] leading-[18px] text-neutral-700">
          J’ai compris que cette phrase <span className="font-medium text-ink">ne peut pas être récupérée</span>. Si je l’oublie, le contenu du Vault sur cet appareil est perdu.
        </span>
      </label>
      <div className="mt-4">
        <Note>La phrase secrète vous sera demandée à chaque ouverture et après une période d’inactivité. Elle protège ce qui est stocké sur cet appareil ; elle ne remplace pas la gestion des accès des invités.</Note>
      </div>
    </Modal>
  );
}

export function PassphraseDialog() {
  const { changePassphrase, openDialog } = useVault();
  const [current, setCurrent] = useState("");
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const ready = current.length > 0 && acceptable(value, confirm) && !busy;
  return (
    <Modal
      title="Changer la phrase secrète"
      width={480}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        setWrong(false);
        if (await changePassphrase(current, value)) return openDialog(null);
        setBusy(false);
        setWrong(true);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? "Vérification…" : "Changer"}
          </Button>
        </>
      }
    >
      <Field label="Phrase secrète actuelle">
        <PassphraseInput id="passphrase-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? "Phrase secrète actuelle incorrecte." : ""}
        </p>
      </Field>
      <NewPassphrase value={value} onChange={setValue} confirm={confirm} onConfirm={setConfirm} idPrefix="passphrase" />
    </Modal>
  );
}

export function UnprotectDialog() {
  const { disableProtection, openDialog } = useVault();
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <Modal
      title="Désactiver la protection ?"
      description="Le Vault ne sera plus chiffré : toute personne ayant accès à cet appareil pourra l’ouvrir."
      onSubmit={async () => {
        if (!current || busy) return;
        setBusy(true);
        setWrong(false);
        if (await disableProtection(current)) return openDialog(null);
        setBusy(false);
        setWrong(true);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!current || busy} className="!bg-red-600 hover:!bg-red-700">
            {busy ? "Déchiffrement…" : "Désactiver"}
          </Button>
        </>
      }
    >
      <Field label="Phrase secrète">
        <PassphraseInput id="unprotect-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? "Phrase secrète incorrecte." : ""}
        </p>
      </Field>
    </Modal>
  );
}
