"use client";

import { LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { LockScreenProps } from "@/lib/store";
import { count } from "@/lib/format";
import { VaultLockup } from "../brand/Brand";
import { INPUT, PassphraseInput } from "../dialog-kit";
import { Button } from "../ui";

const WIPE_WORD = "EFFACER";

/** Seconds to wait after a wrong passphrase: none for the first two, then 5, 10, 20, 30. */
function delayFor(failed: number): number {
  return failed < 3 ? 0 : Math.min(30, 5 * 2 ** (failed - 3));
}

/**
 * Shown instead of the vault while it is locked. Nothing behind it is
 * decrypted: the documents, their names and the folder tree only exist in
 * memory after the passphrase has opened the key.
 */
export function LockScreen({ meta, unlock, wipe }: LockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(meta.failed);
  const [lastFailedAt, setLastFailedAt] = useState(() => (meta.lastFailedAt ? Date.parse(meta.lastFailedAt) : 0));
  const [wrong, setWrong] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);
  const [word, setWord] = useState("");

  const wait = Math.max(0, Math.ceil((lastFailedAt + delayFor(failed) * 1000 - now) / 1000));

  // The countdown only ticks while there is one to show.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [wait]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase || busy || wait > 0) return;
    setBusy(true);
    setWrong(false);
    const result = await unlock(passphrase);
    // On success the provider replaces this screen; only a failure comes back here.
    if (!result.ok) {
      setFailed(result.failed);
      setLastFailedAt(Date.now());
      setNow(Date.now());
      setWrong(true);
      setPassphrase("");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-subtle px-4 py-10">
      <div className="mb-8">
        <VaultLockup />
      </div>
      <main className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-7 shadow-menu">
        <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-white">
          <LockKeyhole className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em] text-ink">Vault verrouillé</h1>
        <p className="mt-1.5 text-[13.5px] leading-[21px] text-neutral-600">Entrez votre phrase secrète pour déchiffrer vos documents.</p>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="unlock-passphrase" className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">
            Phrase secrète
          </label>
          <PassphraseInput id="unlock-passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" autoFocus />
          <div role="alert" className="min-h-[22px] pt-1.5 text-[12.5px]">
            {wait > 0 ? (
              <span className="text-neutral-600">Trop de tentatives. Réessayez dans {wait} s.</span>
            ) : wrong ? (
              <span className="text-red-600">Phrase secrète incorrecte.</span>
            ) : failed > 0 ? (
              <span className="text-neutral-500">
                {count(failed, "tentative")} {failed > 1 ? "échouées" : "échouée"} depuis la dernière ouverture.
              </span>
            ) : null}
          </div>
          <Button variant="primary" type="submit" disabled={!passphrase || busy || wait > 0} className="mt-2 !h-10 w-full !text-[14px]">
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" strokeWidth={2} /> Déverrouillage…
              </>
            ) : (
              "Déverrouiller"
            )}
          </Button>
        </form>

        <div className="mt-5 border-t border-hair pt-4">
          {!forgot ? (
            <button type="button" onClick={() => setForgot(true)} className="text-[12.5px] font-medium text-neutral-500 underline-offset-2 hover:text-ink hover:underline">
              Phrase secrète oubliée ?
            </button>
          ) : (
            <div>
              <p className="text-[12.5px] leading-[19px] text-neutral-600">
                Elle ne peut pas être récupérée : personne d’autre ne la connaît. La seule issue est d’effacer le Vault et tout ce qu’il contient sur cet appareil.
              </p>
              <label htmlFor="wipe-word" className="mb-1.5 mt-3 block text-[12.5px] font-medium text-neutral-700">
                Tapez {WIPE_WORD} pour confirmer
              </label>
              <input id="wipe-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" className={INPUT} />
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    setForgot(false);
                    setWord("");
                  }}
                >
                  Annuler
                </Button>
                <Button variant="primary" disabled={word.trim() !== WIPE_WORD} className="!bg-red-600 hover:!bg-red-700" onClick={() => void wipe()}>
                  Effacer le Vault
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <p className="mt-6 flex max-w-[400px] items-center gap-2 text-center text-[12px] leading-[18px] text-neutral-500">
        <ShieldCheck className="size-4 shrink-0" strokeWidth={1.75} />
        Chiffré sur cet appareil (AES-256). Rien n’est envoyé sur un serveur.
      </p>
    </div>
  );
}
