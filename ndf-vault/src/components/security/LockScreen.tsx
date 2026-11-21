"use client";

import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { LockScreenProps } from "@/lib/store";
import { normalizeRecoveryCode } from "@/lib/crypto";
import { count } from "@/lib/format";
import { t } from "@/lib/i18n";
import { LanguageSwitch } from "../LanguageSwitch";
import { VaultLockup } from "../brand/Brand";
import { INPUT, PassphraseInput } from "../dialog-kit";
import { Button } from "../ui";
import { acceptable, NewPassphrase, NotedCheckbox, RecoveryCodeCard } from "./parts";

const WIPE_WORD = "EFFACER";

/** Seconds to wait after a wrong passphrase or code: none for the first two, then 5, 10, 20, 30. */
function delayFor(failed: number): number {
  return failed < 3 ? 0 : Math.min(30, 5 * 2 ** (failed - 3));
}

const LINK = "text-[12.5px] font-medium text-neutral-500 underline-offset-2 hover:text-ink hover:underline";

/** What the screen is asking for. */
type Mode = "unlock" | "recover" | "newCode" | "wipe";

/**
 * Shown instead of the vault while it is locked. Nothing behind it is
 * decrypted: the documents, their names and the folder tree only exist in
 * memory after the passphrase has opened the key.
 */
export function LockScreen({ meta, unlock, recover, wipe }: LockScreenProps) {
  const hasCode = Boolean(meta.recovery);
  const [mode, setMode] = useState<Mode>("unlock");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(meta.failed);
  const [lastFailedAt, setLastFailedAt] = useState(() => (meta.lastFailedAt ? Date.parse(meta.lastFailedAt) : 0));
  const [wrong, setWrong] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [word, setWord] = useState("");
  // Recovery: the code typed in, the passphrase chosen, then the replacement code to write down.
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newCode, setNewCode] = useState("");
  const [noted, setNoted] = useState(false);

  const wait = Math.max(0, Math.ceil((lastFailedAt + delayFor(failed) * 1000 - now) / 1000));

  // The countdown only ticks while there is one to show.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [wait]);

  const refused = (attempts: number, wiped?: boolean) => {
    // One attempt too many, with the erase option on: the vault is gone, and the screen says so once it reopens empty.
    if (wiped) return void wipe(t("Trop de tentatives échouées : le Vault a été effacé de cet appareil.", "Too many failed attempts: the Vault has been erased from this device."));
    setFailed(attempts);
    setLastFailedAt(Date.now());
    setNow(Date.now());
    setWrong(true);
    setBusy(false);
  };

  const go = (to: Mode) => {
    setMode(to);
    setWrong(false);
    setWord("");
  };

  const submitUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase || busy || wait > 0) return;
    setBusy(true);
    setWrong(false);
    const result = await unlock(passphrase);
    // On success the provider replaces this screen; only a failure comes back here.
    if (!result.ok) {
      setPassphrase("");
      refused(result.failed, result.wiped);
    }
  };

  const codeOk = normalizeRecoveryCode(code) !== null;
  const canRecover = codeOk && acceptable(next, confirm) && !busy && wait <= 0;
  const submitRecover = async (e: FormEvent) => {
    e.preventDefault();
    if (!canRecover) return;
    setBusy(true);
    setWrong(false);
    const result = await recover(code, next);
    if (!result.ok) return refused(result.failed, result.wiped);
    setNewCode(result.code);
    setBusy(false);
    setMode("newCode");
  };

  const open = async () => {
    setBusy(true);
    const result = await unlock(next);
    if (!result.ok) refused(result.failed);
  };

  const left = meta.wipeAfter ? meta.wipeAfter - failed : null;
  const warning = left !== null && failed > 0 && (
    <span data-wipe-warning className={left <= 3 ? "block font-medium text-red-600" : "block text-neutral-600"}>
      {t(`${left > 1 ? `Encore ${left} tentatives` : "Encore une tentative"} avant l’effacement du Vault.`, left > 1 ? `${left} attempts left before the Vault is erased.` : "One attempt left before the Vault is erased.")}
    </span>
  );
  const attempts =
    wait > 0 ? (
      <span className="text-neutral-600">{t(`Trop de tentatives. Réessayez dans ${wait} s.`, `Too many attempts. Try again in ${wait} s.`)}</span>
    ) : wrong ? (
      <span className="text-red-600">{mode === "recover" ? t("Code de récupération incorrect.", "Incorrect recovery code.") : t("Phrase secrète incorrecte.", "Incorrect passphrase.")}</span>
    ) : failed > 0 && mode === "unlock" ? (
      <span className="text-neutral-500">
        {t(`${count(failed, "tentative")} ${failed > 1 ? "échouées" : "échouée"} depuis la dernière ouverture.`, `${count(failed, "failed attempt")} since the Vault was last opened.`)}
      </span>
    ) : null;

  const heading = {
    unlock: t("Vault verrouillé", "Vault locked"),
    recover: t("Phrase secrète oubliée", "Forgotten passphrase"),
    newCode: t("Nouvelle phrase secrète enregistrée", "New passphrase saved"),
    wipe: t("Effacer le Vault", "Erase the Vault"),
  }[mode];
  const lead = {
    unlock: t("Entrez votre phrase secrète pour déchiffrer vos documents.", "Enter your passphrase to decrypt your documents."),
    recover: t("Entrez votre code de récupération, puis choisissez une nouvelle phrase secrète. Vos documents ne changent pas.", "Enter your recovery code, then choose a new passphrase. Your documents do not change."),
    newCode: t("Le code que vous venez d’utiliser ne fonctionne plus. Notez celui-ci à sa place.", "The code you just used no longer works. Write this one down in its place."),
    wipe: hasCode
      ? t(
          "Sans la phrase secrète ni le code de récupération, le contenu ne peut pas être déchiffré. La seule issue est d’effacer le Vault et tout ce qu’il contient sur cet appareil.",
          "Without the passphrase or the recovery code, the content cannot be decrypted. The only way out is to erase the Vault and everything it contains on this device.",
        )
      : t(
          "Aucun code de récupération n’a été créé pour ce Vault, et personne d’autre ne connaît la phrase secrète. La seule issue est d’effacer le Vault et tout ce qu’il contient sur cet appareil.",
          "No recovery code was created for this Vault, and no one else knows the passphrase. The only way out is to erase the Vault and everything it contains on this device.",
        ),
  }[mode];

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto bg-subtle px-4 py-10">
      {/* Whoever cannot read the screen must be able to change its language before anything else. */}
      <LanguageSwitch className="absolute right-4 top-4" />
      <div className="my-auto flex w-full flex-col items-center">
        <div className="mb-8">
          <VaultLockup />
        </div>
        <main className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-7 shadow-menu">
          <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-white">{mode === "unlock" || mode === "wipe" ? <LockKeyhole className="size-5" strokeWidth={1.75} /> : <KeyRound className="size-5" strokeWidth={1.75} />}</span>
          <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em] text-ink">{heading}</h1>
          <p className="mt-1.5 text-[13.5px] leading-[21px] text-neutral-600">{lead}</p>

          {mode === "unlock" && (
            <>
              <form onSubmit={submitUnlock} className="mt-6">
                <label htmlFor="unlock-passphrase" className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">
                  {t("Phrase secrète", "Passphrase")}
                </label>
                <PassphraseInput id="unlock-passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" autoFocus />
                <div role="alert" className="min-h-[22px] pt-1.5 text-[12.5px]">
                  {attempts}
                  {warning}
                </div>
                <Button variant="primary" type="submit" disabled={!passphrase || busy || wait > 0} className="mt-2 !h-10 w-full !text-[14px]">
                  {busy ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" strokeWidth={2} /> {t("Déverrouillage…", "Unlocking…")}
                    </>
                  ) : (
                    t("Déverrouiller", "Unlock")
                  )}
                </Button>
              </form>
              <div className="mt-5 border-t border-hair pt-4">
                <button type="button" onClick={() => go(hasCode ? "recover" : "wipe")} className={LINK}>
                  {t("Phrase secrète oubliée ?", "Forgot your passphrase?")}
                </button>
              </div>
            </>
          )}

          {mode === "recover" && (
            <>
              <form onSubmit={submitRecover} className="mt-6">
                <label htmlFor="recovery-code" className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">
                  {t("Code de récupération", "Recovery code")}
                </label>
                <input id="recovery-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" className={`${INPUT} font-mono uppercase placeholder:normal-case`} />
                <div role="alert" className="min-h-[22px] pb-2 pt-1.5 text-[12.5px]">
                  {attempts ?? (code.trim() !== "" && !codeOk ? <span className="text-neutral-500">{t("Le code compte 24 caractères, en six groupes de quatre.", "The code has 24 characters, in six groups of four.")}</span> : null)}
                </div>
                <NewPassphrase value={next} onChange={setNext} confirm={confirm} onConfirm={setConfirm} idPrefix="recovery" />
                <Button variant="primary" type="submit" disabled={!canRecover} className="!h-10 w-full !text-[14px]">
                  {busy ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" strokeWidth={2} /> {t("Vérification…", "Verifying…")}
                    </>
                  ) : (
                    t("Enregistrer la nouvelle phrase", "Save the new passphrase")
                  )}
                </Button>
              </form>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hair pt-4">
                <button type="button" onClick={() => go("unlock")} className={LINK}>
                  {t("Retour", "Back")}
                </button>
                <button type="button" onClick={() => go("wipe")} className={LINK}>
                  {t("Je n’ai pas ce code", "I don’t have this code")}
                </button>
              </div>
            </>
          )}

          {mode === "newCode" && (
            <div className="mt-6">
              <RecoveryCodeCard code={newCode} />
              <NotedCheckbox checked={noted} onChange={setNoted} />
              <div role="alert" className="min-h-[22px] pt-1.5 text-[12.5px]">
                {wrong && <span className="text-red-600">{t("Le Vault n’a pas pu être ouvert. Rechargez la page et entrez votre nouvelle phrase secrète.", "The Vault could not be opened. Reload the page and enter your new passphrase.")}</span>}
              </div>
              <Button variant="primary" disabled={!noted || busy} className="mt-1 !h-10 w-full !text-[14px]" onClick={() => void open()}>
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" strokeWidth={2} /> {t("Ouverture…", "Opening…")}
                  </>
                ) : (
                  t("Ouvrir le Vault", "Open the Vault")
                )}
              </Button>
            </div>
          )}

          {mode === "wipe" && (
            <div className="mt-5">
              <label htmlFor="wipe-word" className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">
                {t(`Tapez ${WIPE_WORD} pour confirmer`, `Type ${WIPE_WORD} to confirm`)}
              </label>
              <input id="wipe-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoFocus className={INPUT} />
              <div className="mt-3 flex gap-2">
                <Button onClick={() => go("unlock")}>{t("Annuler", "Cancel")}</Button>
                <Button variant="primary" disabled={word.trim() !== WIPE_WORD} className="!bg-red-600 hover:!bg-red-700" onClick={() => void wipe()}>
                  {t("Effacer le Vault", "Erase the Vault")}
                </Button>
              </div>
            </div>
          )}
        </main>
        <p className="mt-6 flex max-w-[400px] items-center gap-2 text-center text-[12px] leading-[18px] text-neutral-500">
          <ShieldCheck className="size-4 shrink-0" strokeWidth={1.75} />
          {t("Chiffré sur cet appareil (AES-256). Rien n’est envoyé sur un serveur.", "Encrypted on this device (AES-256). Nothing is sent to a server.")}
        </p>
      </div>
    </div>
  );
}
