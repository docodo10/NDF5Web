"use client";

import { FileUp, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVault, type AuditReport, type AuditState, type RestoreOutcome } from "@/lib/store";
import { backupDate, BACKUP_EXTENSION } from "@/lib/backup";
import { count, formatMoment, formatSize } from "@/lib/format";
import { localized, t } from "@/lib/i18n";
import { Field, Modal, Note, PassphraseInput } from "../dialog-kit";
import { Button, Chip } from "../ui";
import { acceptable, NewPassphrase, NotedCheckbox, RecoveryCodeCard } from "./parts";

/** The second step of anything that creates a recovery code: show it once, and make sure it was written down. */
function RecoveryStep({ code, title, description }: { code: string; title: string; description: string }) {
  const { openDialog } = useVault();
  const [noted, setNoted] = useState(false);
  return (
    <Modal
      title={title}
      description={description}
      width={480}
      onSubmit={() => noted && openDialog(null)}
      footer={
        <Button variant="primary" type="submit" disabled={!noted}>
          {t("Terminer", "Done")}
        </Button>
      }
    >
      <RecoveryCodeCard code={code} />
      <NotedCheckbox checked={noted} onChange={setNoted} />
      <div className="mt-4">
        <Note>{t("Si vous oubliez votre phrase secrète, ce code vous laisse en choisir une nouvelle. Quiconque possède ce code et cet appareil peut ouvrir le Vault : ne le gardez pas avec lui.", "If you forget your passphrase, this code lets you choose a new one. Anyone who has this code and this device can open the Vault: do not keep the code with the device.")}</Note>
      </div>
    </Modal>
  );
}

export function ProtectDialog() {
  const { enableProtection, createRecoveryCode, openDialog } = useVault();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const ready = acceptable(value, confirm) && understood && !busy;
  if (code) return <RecoveryStep code={code} title={t("Notez votre code de récupération", "Write down your recovery code")} description={t("Le Vault est maintenant chiffré. Ce code est votre seule issue si la phrase secrète est oubliée.", "The Vault is now encrypted. This code is your only way back in if the passphrase is forgotten.")} />;
  return (
    <Modal
      title={t("Protéger le Vault", "Protect the Vault")}
      description={t("Tout ce qui est stocké sera chiffré avec votre phrase secrète.", "Everything stored will be encrypted with your passphrase.")}
      width={480}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        if (!(await enableProtection(value))) return openDialog(null);
        // The vault is protected from here on; the code is the way back in if the passphrase is forgotten.
        const created = await createRecoveryCode(value);
        if (created) setCode(created);
        else openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? t("Chiffrement…", "Encrypting…") : t("Activer la protection", "Turn on protection")}
          </Button>
        </>
      }
    >
      <NewPassphrase value={value} onChange={setValue} confirm={confirm} onConfirm={setConfirm} idPrefix="protect" autoFocus />
      <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5">
        <input id="protect-understood" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-black" />
        <span className="text-[12.5px] leading-[18px] text-neutral-700">
          {t(
            <>J’ai compris que personne ne peut me redonner cette phrase. Si je l’oublie <span className="font-medium text-ink">et que je perds le code de récupération</span>, le contenu du Vault sur cet appareil est perdu.</>,
            <>I understand that no one can give this passphrase back to me. If I forget it <span className="font-medium text-ink">and lose the recovery code</span>, the content of the Vault on this device is lost.</>,
          )}
        </span>
      </label>
      <div className="mt-4">
        <Note>
          {t(
            "La phrase secrète vous sera demandée à chaque ouverture et après une période d’inactivité. Un code de récupération vous sera remis à l’étape suivante. Cette protection couvre ce qui est stocké sur cet appareil ; elle ne remplace pas la gestion des accès des invités.",
            "You will be asked for the passphrase each time the Vault is opened and after a period of inactivity. A recovery code will be given to you in the next step. This protection covers what is stored on this device; it does not replace managing guest access.",
          )}
        </Note>
      </div>
    </Modal>
  );
}

/** Create a recovery code for a vault that has none, or replace the one it has. */
export function RecoveryDialog() {
  const { createRecoveryCode, security, openDialog } = useVault();
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [replacing] = useState(security.recoveryAt !== null);
  if (code) return <RecoveryStep code={code} title={t("Notez votre code de récupération", "Write down your recovery code")} description={replacing ? t("L’ancien code ne fonctionne plus. Celui-ci le remplace.", "The old code no longer works. This one replaces it.") : t("Ce code est votre seule issue si la phrase secrète est oubliée.", "This code is your only way back in if the passphrase is forgotten.")} />;
  return (
    <Modal
      title={replacing ? t("Remplacer le code de récupération", "Replace the recovery code") : t("Créer un code de récupération", "Create a recovery code")}
      description={
        replacing
          ? t("Un nouveau code est créé et l’ancien cesse de fonctionner.", "A new code is created and the old one stops working.")
          : t("Un code à garder hors de cet appareil, pour choisir une nouvelle phrase secrète si la vôtre est oubliée.", "A code to keep off this device, to choose a new passphrase if you forget yours.")
      }
      onSubmit={async () => {
        if (!current || busy) return;
        setBusy(true);
        setWrong(false);
        const created = await createRecoveryCode(current);
        if (created) return setCode(created);
        setBusy(false);
        setWrong(true);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!current || busy}>
            {busy ? t("Vérification…", "Verifying…") : replacing ? t("Remplacer le code", "Replace the code") : t("Créer le code", "Create the code")}
          </Button>
        </>
      }
    >
      <Field label={t("Phrase secrète", "Passphrase")}>
        <PassphraseInput id="recovery-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
        </p>
      </Field>
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
      title={t("Changer la phrase secrète", "Change the passphrase")}
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
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? t("Vérification…", "Verifying…") : t("Changer", "Change")}
          </Button>
        </>
      }
    >
      <Field label={t("Phrase secrète actuelle", "Current passphrase")}>
        <PassphraseInput id="passphrase-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? t("Phrase secrète actuelle incorrecte.", "Incorrect current passphrase.") : ""}
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
      title={t("Désactiver la protection ?", "Turn off protection?")}
      description={t("Le Vault ne sera plus chiffré : toute personne ayant accès à cet appareil pourra l’ouvrir.", "The Vault will no longer be encrypted: anyone with access to this device will be able to open it.")}
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
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!current || busy} className="!bg-red-600 hover:!bg-red-700">
            {busy ? t("Déchiffrement…", "Decrypting…") : t("Désactiver", "Turn off")}
          </Button>
        </>
      }
    >
      <Field label={t("Phrase secrète", "Passphrase")}>
        <PassphraseInput id="unprotect-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
        </p>
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------- Backup */

export function BackupDialog() {
  const { createBackup, files, openDialog } = useVault();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = acceptable(value, confirm) && !busy;
  const uploaded = files.filter((f) => !f.sample);
  const bytes = uploaded.reduce((n, f) => n + f.size + (f.versions ?? []).reduce((m, x) => m + x.size, 0), 0);
  return (
    <Modal
      title={t("Créer une sauvegarde chiffrée", "Create an encrypted backup")}
      description={t("Tout le Vault dans un seul fichier, à garder hors de cet appareil.", "The whole Vault in a single file, to keep off this device.")}
      width={480}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        if (await createBackup(value)) return openDialog(null);
        setBusy(false);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? t("Chiffrement…", "Encrypting…") : t("Créer la sauvegarde", "Create the backup")}
          </Button>
        </>
      }
    >
      <NewPassphrase value={value} onChange={setValue} confirm={confirm} onConfirm={setConfirm} idPrefix="backup" label={t("Phrase secrète de la sauvegarde", "Backup passphrase")} autoFocus />
      <Note>
        {t(
          `La sauvegarde contient les dossiers, les projets, le journal et ${uploaded.length === 0 ? "aucun original pour l’instant" : `${uploaded.length} fichier${uploaded.length > 1 ? "s" : ""} téléversé${uploaded.length > 1 ? "s" : ""} avec leurs versions (${formatSize(bytes)})`}. Elle est chiffrée avec cette phrase, qui peut être différente de celle du Vault. Sans elle, la sauvegarde est illisible.`,
          `The backup contains the folders, the projects, the activity log and ${uploaded.length === 0 ? "no originals for now" : `${count(uploaded.length, "uploaded file")} with ${uploaded.length > 1 ? "their" : "its"} versions (${formatSize(bytes)})`}. It is encrypted with this passphrase, which can be different from the Vault’s. Without it, the backup is unreadable.`,
        )}
      </Note>
    </Modal>
  );
}

// Answers in the current language each time it is read (see `localized`).
const RESTORE_ERROR: Partial<Record<RestoreOutcome, string>> = localized({
  "wrong-passphrase": ["Phrase secrète incorrecte.", "Incorrect passphrase."],
  "not-a-backup": ["Ce fichier n’est pas une sauvegarde NDF Vault.", "This file is not an NDF Vault backup."],
  damaged: ["Cette sauvegarde est endommagée ou a été modifiée : rien n’a été remplacé.", "This backup is damaged or has been modified: nothing was replaced."],
  unsupported: ["Cette sauvegarde vient d’une version de NDF Vault que celle-ci ne sait pas lire.", "This backup comes from a version of NDF Vault that this one cannot read."],
  "no-space": ["Il n’y a pas assez d’espace sur cet appareil pour cette sauvegarde : rien n’a été remplacé.", "There is not enough space on this device for this backup: nothing was replaced."],
  failed: ["La restauration n’a pas pu commencer : rien n’a été remplacé.", "The restore could not start: nothing was replaced."],
});

export function RestoreDialog() {
  const { restoreBackup, verifyPassphrase, security, openDialog } = useVault();
  const [own, setOwn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = file !== null && date !== null && passphrase.length > 0 && understood && !busy && (!security.protected || own.length > 0);

  const pick = async (picked: File | null) => {
    setFile(picked);
    setDate(null);
    setFileError("");
    setError("");
    if (!picked) return;
    try {
      setDate(await backupDate(picked));
    } catch {
      setFileError(RESTORE_ERROR["not-a-backup"] ?? "");
    }
  };

  return (
    <Modal
      title={t("Restaurer une sauvegarde", "Restore a backup")}
      description={t("Remplace le contenu du Vault sur cet appareil par celui d’une sauvegarde.", "Replaces the content of the Vault on this device with that of a backup.")}
      width={480}
      onSubmit={async () => {
        if (!ready || !file) return;
        setBusy(true);
        setError("");
        // Replacing a protected vault takes its own passphrase, not only the backup's.
        if (!(await verifyPassphrase(own))) {
          setError(t("Phrase secrète du Vault incorrecte.", "Incorrect Vault passphrase."));
          return setBusy(false);
        }
        const outcome = await restoreBackup(file, passphrase);
        // On success the vault reloads and this dialog goes away with the old session.
        if (outcome === "ok" || outcome === "incomplete") return;
        setError(RESTORE_ERROR[outcome] ?? RESTORE_ERROR.failed ?? "");
        setBusy(false);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!ready} className="!bg-red-600 hover:!bg-red-700 disabled:!bg-neutral-400">
            {busy ? t("Restauration…", "Restoring…") : t("Restaurer", "Restore")}
          </Button>
        </>
      }
    >
      <Field label={t("Fichier de sauvegarde", "Backup file")}>
        <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-neutral-300 px-3 py-3 transition-colors duration-150 hover:border-neutral-400 hover:bg-subtle">
          <FileUp className="size-5 shrink-0 text-neutral-500" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-[13px]">
            {file ? (
              <>
                <span className="block truncate font-medium text-ink">{file.name}</span>
                <span className="block text-[12px] text-neutral-500">{date ? t(`Sauvegarde du ${formatMoment(date)} · ${formatSize(file.size)}`, `Backup from ${formatMoment(date)} · ${formatSize(file.size)}`) : formatSize(file.size)}</span>
              </>
            ) : (
              <span className="text-neutral-600">{t(`Choisir un fichier .${BACKUP_EXTENSION}`, `Choose a .${BACKUP_EXTENSION} file`)}</span>
            )}
          </span>
          <input id="restore-file" type="file" accept={`.${BACKUP_EXTENSION}`} className="sr-only" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        </label>
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {fileError}
        </p>
      </Field>
      <Field label={t("Phrase secrète de la sauvegarde", "Backup passphrase")}>
        <PassphraseInput id="restore-passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" />
        {!security.protected && (
          <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
            {error}
          </p>
        )}
      </Field>
      {security.protected && (
        <Field label={t("Phrase secrète du Vault", "Vault passphrase")} hint={t("Demandée parce que la restauration remplace un Vault protégé.", "Asked for because the restore replaces a protected Vault.")}>
          <PassphraseInput id="restore-own-passphrase" value={own} onChange={setOwn} autoComplete="current-password" />
          <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
            {error}
          </p>
        </Field>
      )}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5">
        <input id="restore-understood" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-black" />
        <span className="text-[12.5px] leading-[18px] text-neutral-700">
          {t(
            <>J’ai compris que la restauration <span className="font-medium text-ink">remplace tout le contenu actuel</span> du Vault sur cet appareil. La protection par phrase secrète du Vault, elle, ne change pas.</>,
            <>I understand that the restore <span className="font-medium text-ink">replaces all the current content</span> of the Vault on this device. The Vault’s passphrase protection itself does not change.</>,
          )}
        </span>
      </label>
    </Modal>
  );
}

/* ---------------------------------------------------- Sensitive actions */

/** Ask for the vault's passphrase again before something leaves its protection. */
export function ExportVaultDialog() {
  const { exportVault, verifyPassphrase, openDialog } = useVault();
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <Modal
      title={t("Exporter tout le Vault", "Export the whole Vault")}
      description={t("L’archive ZIP n’est pas chiffrée : une fois exportés, vos originaux ne sont plus protégés par le Vault.", "The ZIP archive is not encrypted: once exported, your originals are no longer protected by the Vault.")}
      onSubmit={async () => {
        if (!current || busy) return;
        setBusy(true);
        setWrong(false);
        if (!(await verifyPassphrase(current))) {
          setWrong(true);
          return setBusy(false);
        }
        openDialog(null);
        void exportVault();
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!current || busy}>
            {busy ? t("Vérification…", "Verifying…") : t("Exporter", "Export")}
          </Button>
        </>
      }
    >
      <Field label={t("Phrase secrète", "Passphrase")}>
        <PassphraseInput id="export-passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
        </p>
      </Field>
      <Note>{t("Pour une copie qui reste chiffrée, utilisez plutôt « Sauvegarder » : la sauvegarde est illisible sans sa phrase secrète.", "For a copy that stays encrypted, use “Back up” instead: the backup is unreadable without its passphrase.")}</Note>
    </Modal>
  );
}

const AUDIT_CHIP: Record<AuditState, { label: string; className: string }> = {
  altered: {
    get label() {
      return t("Altéré", "Altered");
    },
    className: "!border-red-300 !text-red-700",
  },
  missing: {
    get label() {
      return t("Introuvable", "Not found");
    },
    className: "!border-amber-300 !text-amber-700",
  },
  unverified: {
    get label() {
      return t("Sans empreinte", "No fingerprint");
    },
    className: "border-dashed text-neutral-500",
  },
};

/** Check every stored original against its fingerprint, and say what was found. */
export function AuditDialog() {
  const { auditVault, openDialog } = useVault();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<AuditReport | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void auditVault((done, total) => setProgress({ done, total })).then(setReport);
    // Runs once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bad = report?.problems.filter((p) => p.state !== "unverified").length ?? 0;
  return (
    <Modal
      title={t("Intégrité des fichiers", "File integrity")}
      description={t("L’empreinte SHA-256 de chaque original est recalculée et comparée à celle prise au téléversement.", "The SHA-256 fingerprint of each original is recomputed and compared with the one taken at upload.")}
      width={480}
      footer={
        <Button variant="primary" onClick={() => openDialog(null)}>
          {t("Fermer", "Close")}
        </Button>
      }
    >
      {!report ? (
        <div role="status" className="py-2">
          <p className="text-[13.5px] text-neutral-700">
            {t("Vérification…", "Checking…")} {progress.total > 0 && <span className="tabular-nums text-neutral-500">{t(`${progress.done} sur ${progress.total}`, `${progress.done} of ${progress.total}`)}</span>}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-ink transition-[width] duration-150" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      ) : (
        <div data-audit-report>
          <div className="flex items-start gap-3">
            {bad > 0 ? <ShieldAlert className="mt-0.5 size-6 shrink-0 text-red-500" strokeWidth={1.5} /> : <ShieldCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" strokeWidth={1.5} />}
            <div>
              <p className="text-[14.5px] font-semibold text-ink">
                {report.total === 0
                  ? t("Aucun original à vérifier", "No originals to check")
                  : bad > 0
                    ? t(`${bad} ${bad > 1 ? "originaux" : "original"} sur ${report.total} ${bad > 1 ? "posent" : "pose"} problème`, `${bad} of ${count(report.total, "original")} ${bad > 1 ? "have" : "has"} a problem`)
                    : report.total === 1
                      ? t("L’original est intact", "The original is intact")
                      : t(`Les ${report.total} originaux sont intacts`, `All ${report.total} originals are intact`)}
              </p>
              <p className="mt-1 text-[13px] leading-[19px] text-neutral-600">
                {report.total === 0
                  ? t("Les fichiers d’exemple n’ont pas d’original. Téléversez un fichier pour le vérifier.", "Sample files have no original. Upload a file to check it.")
                  : bad > 0
                    ? t(
                        "Un fichier altéré n’est ni affiché ni téléchargeable. Supprimez-le et téléversez l’original de nouveau, ou restaurez une sauvegarde.",
                        "An altered file is neither shown nor downloadable. Delete it and upload the original again, or restore a backup.",
                      )
                    : t("Versions précédentes comprises. La vérification est consignée dans le journal de sécurité.", "Previous versions included. The check is recorded in the security log.")}
              </p>
            </div>
          </div>
          {report.problems.length > 0 && (
            <ul aria-label={t("Fichiers à problème", "Files with a problem")} className="scroll-quiet mt-4 max-h-[240px] divide-y divide-hair overflow-y-auto rounded-[10px] border border-line">
              {report.problems.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 break-words text-[13px] text-ink">{p.label}</span>
                  <Chip className={AUDIT_CHIP[p.state].className}>{AUDIT_CHIP[p.state].label}</Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** A document in high protection, opened from a session that has not given the passphrase recently. */
export function UnlockDocDialog({ fileId, listIds, fullscreen, page }: { fileId: string; listIds?: string[]; fullscreen?: boolean; page?: number }) {
  const { files, verifyPassphrase, openPreview, openDialog } = useVault();
  const file = files.find((f) => f.id === fileId);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <Modal
      title={t("Document en haute protection", "High-protection document")}
      description={file ? `${file.name}.${file.ext}` : undefined}
      onSubmit={async () => {
        if (!current || busy) return;
        setBusy(true);
        setWrong(false);
        if (!(await verifyPassphrase(current))) {
          setWrong(true);
          return setBusy(false);
        }
        openDialog(null);
        openPreview(fileId, listIds, fullscreen, page);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!current || busy}>
            {busy ? t("Vérification…", "Verifying…") : t("Ouvrir", "Open")}
          </Button>
        </>
      }
    >
      <Field label={t("Phrase secrète", "Passphrase")} hint={t("Redemandée pour ce niveau de protection, puis valable cinq minutes.", "Asked for again at this protection level, then valid for five minutes.")}>
        <PassphraseInput id="doc-passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
        </p>
      </Field>
    </Modal>
  );
}
