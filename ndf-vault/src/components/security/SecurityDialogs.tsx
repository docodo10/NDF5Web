"use client";

import { FileUp, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVault, type AuditReport, type AuditState, type RestoreOutcome } from "@/lib/store";
import { backupDate, BACKUP_EXTENSION } from "@/lib/backup";
import { formatMoment, formatSize } from "@/lib/format";
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
          Terminer
        </Button>
      }
    >
      <RecoveryCodeCard code={code} />
      <NotedCheckbox checked={noted} onChange={setNoted} />
      <div className="mt-4">
        <Note>Si vous oubliez votre phrase secrète, ce code vous laisse en choisir une nouvelle. Quiconque possède ce code et cet appareil peut ouvrir le Vault : ne le gardez pas avec lui.</Note>
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
  if (code) return <RecoveryStep code={code} title="Notez votre code de récupération" description="Le Vault est maintenant chiffré. Ce code est votre seule issue si la phrase secrète est oubliée." />;
  return (
    <Modal
      title="Protéger le Vault"
      description="Tout ce qui est stocké sera chiffré avec votre phrase secrète."
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
          J’ai compris que personne ne peut me redonner cette phrase. Si je l’oublie <span className="font-medium text-ink">et que je perds le code de récupération</span>, le contenu du Vault sur cet appareil est perdu.
        </span>
      </label>
      <div className="mt-4">
        <Note>La phrase secrète vous sera demandée à chaque ouverture et après une période d’inactivité. Un code de récupération vous sera remis à l’étape suivante. Cette protection couvre ce qui est stocké sur cet appareil ; elle ne remplace pas la gestion des accès des invités.</Note>
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
  if (code) return <RecoveryStep code={code} title="Notez votre code de récupération" description={replacing ? "L’ancien code ne fonctionne plus. Celui-ci le remplace." : "Ce code est votre seule issue si la phrase secrète est oubliée."} />;
  return (
    <Modal
      title={replacing ? "Remplacer le code de récupération" : "Créer un code de récupération"}
      description={replacing ? "Un nouveau code est créé et l’ancien cesse de fonctionner." : "Un code à garder hors de cet appareil, pour choisir une nouvelle phrase secrète si la vôtre est oubliée."}
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
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!current || busy}>
            {busy ? "Vérification…" : replacing ? "Remplacer le code" : "Créer le code"}
          </Button>
        </>
      }
    >
      <Field label="Phrase secrète">
        <PassphraseInput id="recovery-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? "Phrase secrète incorrecte." : ""}
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
      title="Créer une sauvegarde chiffrée"
      description="Tout le Vault dans un seul fichier, à garder hors de cet appareil."
      width={480}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        if (await createBackup(value)) return openDialog(null);
        setBusy(false);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {busy ? "Chiffrement…" : "Créer la sauvegarde"}
          </Button>
        </>
      }
    >
      <NewPassphrase value={value} onChange={setValue} confirm={confirm} onConfirm={setConfirm} idPrefix="backup" label="Phrase secrète de la sauvegarde" autoFocus />
      <Note>
        La sauvegarde contient les dossiers, les projets, le journal et {uploaded.length === 0 ? "aucun original pour l’instant" : `${uploaded.length} fichier${uploaded.length > 1 ? "s" : ""} téléversé${uploaded.length > 1 ? "s" : ""} avec leurs versions (${formatSize(bytes)})`}. Elle est chiffrée avec cette phrase, qui peut être différente de celle du Vault. Sans elle, la sauvegarde est illisible.
      </Note>
    </Modal>
  );
}

const RESTORE_ERROR: Partial<Record<RestoreOutcome, string>> = {
  "wrong-passphrase": "Phrase secrète incorrecte.",
  "not-a-backup": "Ce fichier n’est pas une sauvegarde NDF Vault.",
  damaged: "Cette sauvegarde est endommagée ou a été modifiée : rien n’a été remplacé.",
  unsupported: "Cette sauvegarde vient d’une version de NDF Vault que celle-ci ne sait pas lire.",
  "no-space": "Il n’y a pas assez d’espace sur cet appareil pour cette sauvegarde : rien n’a été remplacé.",
  failed: "La restauration n’a pas pu commencer : rien n’a été remplacé.",
};

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
      title="Restaurer une sauvegarde"
      description="Remplace le contenu du Vault sur cet appareil par celui d’une sauvegarde."
      width={480}
      onSubmit={async () => {
        if (!ready || !file) return;
        setBusy(true);
        setError("");
        // Replacing a protected vault takes its own passphrase, not only the backup's.
        if (!(await verifyPassphrase(own))) {
          setError("Phrase secrète du Vault incorrecte.");
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
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!ready} className="!bg-red-600 hover:!bg-red-700 disabled:!bg-neutral-400">
            {busy ? "Restauration…" : "Restaurer"}
          </Button>
        </>
      }
    >
      <Field label="Fichier de sauvegarde">
        <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-neutral-300 px-3 py-3 transition-colors duration-150 hover:border-neutral-400 hover:bg-subtle">
          <FileUp className="size-5 shrink-0 text-neutral-500" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-[13px]">
            {file ? (
              <>
                <span className="block truncate font-medium text-ink">{file.name}</span>
                <span className="block text-[12px] text-neutral-500">{date ? `Sauvegarde du ${formatMoment(date)} · ${formatSize(file.size)}` : formatSize(file.size)}</span>
              </>
            ) : (
              <span className="text-neutral-600">Choisir un fichier .{BACKUP_EXTENSION}</span>
            )}
          </span>
          <input id="restore-file" type="file" accept={`.${BACKUP_EXTENSION}`} className="sr-only" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        </label>
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {fileError}
        </p>
      </Field>
      <Field label="Phrase secrète de la sauvegarde">
        <PassphraseInput id="restore-passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" />
        {!security.protected && (
          <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
            {error}
          </p>
        )}
      </Field>
      {security.protected && (
        <Field label="Phrase secrète du Vault" hint="Demandée parce que la restauration remplace un Vault protégé.">
          <PassphraseInput id="restore-own-passphrase" value={own} onChange={setOwn} autoComplete="current-password" />
          <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
            {error}
          </p>
        </Field>
      )}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line px-3 py-2.5">
        <input id="restore-understood" type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-black" />
        <span className="text-[12.5px] leading-[18px] text-neutral-700">
          J’ai compris que la restauration <span className="font-medium text-ink">remplace tout le contenu actuel</span> du Vault sur cet appareil. La protection par phrase secrète du Vault, elle, ne change pas.
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
      title="Exporter tout le Vault"
      description="L’archive ZIP n’est pas chiffrée : une fois exportés, vos originaux ne sont plus protégés par le Vault."
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
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!current || busy}>
            {busy ? "Vérification…" : "Exporter"}
          </Button>
        </>
      }
    >
      <Field label="Phrase secrète">
        <PassphraseInput id="export-passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
          {wrong ? "Phrase secrète incorrecte." : ""}
        </p>
      </Field>
      <Note>Pour une copie qui reste chiffrée, utilisez plutôt « Sauvegarder » : la sauvegarde est illisible sans sa phrase secrète.</Note>
    </Modal>
  );
}

const AUDIT_CHIP: Record<AuditState, { label: string; className: string }> = {
  altered: { label: "Altéré", className: "!border-red-300 !text-red-700" },
  missing: { label: "Introuvable", className: "!border-amber-300 !text-amber-700" },
  unverified: { label: "Sans empreinte", className: "border-dashed text-neutral-500" },
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
      title="Intégrité des fichiers"
      description="L’empreinte SHA-256 de chaque original est recalculée et comparée à celle prise au téléversement."
      width={480}
      footer={
        <Button variant="primary" onClick={() => openDialog(null)}>
          Fermer
        </Button>
      }
    >
      {!report ? (
        <div role="status" className="py-2">
          <p className="text-[13.5px] text-neutral-700">
            Vérification… {progress.total > 0 && <span className="tabular-nums text-neutral-500">{progress.done} sur {progress.total}</span>}
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
                  ? "Aucun original à vérifier"
                  : bad > 0
                    ? `${bad} ${bad > 1 ? "originaux" : "original"} sur ${report.total} ${bad > 1 ? "posent" : "pose"} problème`
                    : report.total === 1
                      ? "L’original est intact"
                      : `Les ${report.total} originaux sont intacts`}
              </p>
              <p className="mt-1 text-[13px] leading-[19px] text-neutral-600">
                {report.total === 0
                  ? "Les fichiers d’exemple n’ont pas d’original. Téléversez un fichier pour le vérifier."
                  : bad > 0
                    ? "Un fichier altéré n’est ni affiché ni téléchargeable. Supprimez-le et téléversez l’original de nouveau, ou restaurez une sauvegarde."
                    : "Versions précédentes comprises. La vérification est consignée dans le journal de sécurité."}
              </p>
            </div>
          </div>
          {report.problems.length > 0 && (
            <ul aria-label="Fichiers à problème" className="scroll-quiet mt-4 max-h-[240px] divide-y divide-hair overflow-y-auto rounded-[10px] border border-line">
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
