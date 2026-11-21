"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, CloudUpload, FolderUp, Copy, Download, Lock, ShieldCheck, Trash2, TriangleAlert, Users, X } from "lucide-react";
import { FolderIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { highest, lowers, PROTECTION_HINT, PROTECTION_LABEL, PROTECTION_LEVELS, protectionOf, type Protection } from "@/lib/protection";
import { foldUnchanged } from "@/lib/diff";
import { useVault, type CompareResult } from "@/lib/store";
import type { FileStatus, Folder, Project, VaultFile } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { count, descendantIds, folderLabel, formatDate, formatSize, formatTime, fullName, STATUS_LABEL } from "@/lib/format";
import { folderRules } from "@/lib/selectors";
import { t } from "@/lib/i18n";
import { ACCEPT_ATTR, inspectUpload, pickedFromDrop, pickedFromInput, type Picked, type UploadCheck } from "@/lib/uploads";
import { Avatar, Button, Chip, IconButton } from "./ui";
import { Field, INPUT, Modal, Note, PassphraseInput, Toggle } from "./dialog-kit";

import { AuditDialog, BackupDialog, ExportVaultDialog, UnlockDocDialog, PassphraseDialog, ProtectDialog, RecoveryDialog, RestoreDialog, UnprotectDialog } from "./security/SecurityDialogs";

export { SwitchRow } from "./dialog-kit";


function useFlatFolders(folders: Folder[]) {
  return useMemo(() => {
    const out: { folder: Folder; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const f of folders.filter((x) => x.parentId === parentId)) {
        out.push({ folder: f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders]);
}

/* ------------------------------------------------------------------ Dialogs */

function RenameDialog({ file }: { file: VaultFile }) {
  const { renameFile, openDialog } = useVault();
  const [name, setName] = useState(file.name);
  const save = () => {
    if (!name.trim()) return;
    renameFile(file.id, name);
    openDialog(null);
  };
  return (
    <Modal
      title={t("Renommer le fichier", "Rename file")}
      onSubmit={save}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === file.name}>
            {t("Renommer", "Rename")}
          </Button>
        </>
      }
    >
      <Field label={t("Nom du fichier", "File name")}>
        <div className="flex items-center gap-2">
          <input data-autofocus id="file-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} onFocus={(e) => e.target.select()} />
          <span className="shrink-0 text-[13px] text-neutral-500">.{file.ext}</span>
        </div>
      </Field>
    </Modal>
  );
}

/** The file's SHA-256 fingerprint, with a button that checks the stored original still matches it. */
function Fingerprint({ file }: { file: VaultFile }) {
  const { readOriginal } = useVault();
  const [state, setState] = useState<"idle" | "busy" | "ok" | "bad">("idle");
  const [copied, setCopied] = useState(false);
  if (!file.sha256) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.sha256 ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the fingerprint stays selectable on screen */
    }
  };
  return (
    <div className="mt-3 rounded-[10px] border border-line px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-medium text-neutral-700">{t("Empreinte SHA-256", "SHA-256 fingerprint")}</p>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-ink">
          {copied ? <Check className="size-3.5" strokeWidth={2} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
          {copied ? t("Copiée", "Copied") : t("Copier", "Copy")}
        </button>
      </div>
      <p className="mt-1 select-all break-all font-mono text-[11.5px] leading-[17px] text-neutral-600">{file.sha256}</p>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p role="status" className={clsx("flex items-center gap-1.5 text-[12.5px]", state === "ok" ? "text-emerald-700" : state === "bad" ? "text-red-600" : "text-neutral-500")}>
          {state === "ok" && <ShieldCheck className="size-4" strokeWidth={1.75} />}
          {state === "bad" && <TriangleAlert className="size-4" strokeWidth={1.75} />}
          {state === "ok"
            ? t("Intégrité vérifiée : l’original est intact.", "Integrity verified: the original is intact.")
            : state === "bad"
              ? t("L’original ne correspond plus à cette empreinte.", "The original no longer matches this fingerprint.")
              : t("Calculée au téléversement.", "Computed at upload.")}
        </p>
        <Button
          size="sm"
          disabled={state === "busy"}
          onClick={async () => {
            setState("busy");
            setState((await readOriginal(file)).status === "ok" ? "ok" : "bad");
          }}
        >
          {state === "busy" ? t("Vérification…", "Verifying…") : t("Vérifier", "Verify")}
        </Button>
      </div>
    </div>
  );
}

function DetailsDialog({ file }: { file: VaultFile }) {
  const { projects, updateFile, openDialog } = useVault();
  const [status, setStatus] = useState<FileStatus>(file.status);
  const [projectId, setProjectId] = useState(file.projectId ?? "");
  const [tags, setTags] = useState(file.tags.join(", "));
  const [notes, setNotes] = useState(file.notes);
  const [favorite, setFavorite] = useState(file.favorite);
  const [pinned, setPinned] = useState(file.pinned);
  const save = () => {
    updateFile(file.id, {
      status,
      archived: status === "Archived",
      projectId: projectId || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: notes.trim(),
      favorite,
      pinned,
    });
    openDialog(null);
  };
  return (
    <Modal
      title={t("Modifier les détails", "Edit details")}
      description={fullName(file)}
      onSubmit={save}
      width={480}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit">
            {t("Enregistrer", "Save")}
          </Button>
        </>
      }
    >
      <Field label={t("Statut", "Status")}>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={clsx(
                "inline-flex h-8 items-center rounded-lg border px-3 text-[12.5px] font-medium transition-colors duration-150",
                status === s ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-600 hover:border-neutral-300",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("Projet", "Project")}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
          <option value="">{t("Sans projet", "No project")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("Étiquettes", "Tags")} hint={t("Séparez les étiquettes par des virgules.", "Separate tags with commas.")}>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT} placeholder={t("scénario, FS1", "screenplay, FS1")} />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={clsx(INPUT, "h-auto resize-none py-2 leading-5")} placeholder={t("Ajoutez une note pour vos collaborateurs", "Add a note for your collaborators")} />
      </Field>
      <div className="mt-1 divide-y divide-hair border-t border-hair pt-1">
        <Toggle on={favorite} onChange={setFavorite} label={t("Favori", "Favorite")} />
        <Toggle on={pinned} onChange={setPinned} label={t("Épingler à l’accueil", "Pin to Home")} />
      </div>
      {!file.sample && <Fingerprint file={file} />}
    </Modal>
  );
}

function FolderPicker({ value, onChange, exclude, disabled }: { value: string; onChange: (id: string) => void; exclude?: string; disabled?: Set<string> }) {
  const { folders } = useVault();
  const flat = useFlatFolders(folders);
  return (
    <ul className="scroll-quiet max-h-[280px] overflow-y-auto rounded-[10px] border border-line p-1" role="listbox" aria-label={t("Dossier de destination", "Destination folder")}>
      {flat.map(({ folder, depth }) => {
        const on = value === folder.id;
        return (
          <li key={folder.id}>
            <button
              type="button"
              role="option"
              aria-selected={on}
              disabled={folder.id === exclude || disabled?.has(folder.id)}
              onClick={() => onChange(folder.id)}
              className={clsx("flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] transition-colors duration-100 disabled:opacity-40", on ? "bg-ink text-white" : "text-neutral-700 hover:bg-fill")}
              style={{ paddingLeft: 10 + depth * 16 }}
            >
              <FolderIcon weight="fill" className={clsx("size-[17px] shrink-0", on ? "text-white/80" : "text-neutral-400")} />
              <span className="truncate">{folderLabel(folder)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MoveDialog({ fileIds }: { fileIds: string[] }) {
  const { files, moveFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const current = fileIds.length === 1 ? first?.folderId : undefined;
  const [dest, setDest] = useState("");
  return (
    <Modal
      title={fileIds.length === 1 && first ? t("Déplacer le fichier", "Move file") : t(`Déplacer ${count(fileIds.length, "fichier")}`, `Move ${count(fileIds.length, "file")}`)}
      description={fileIds.length === 1 && first ? fullName(first) : t("Choisissez le dossier de destination.", "Choose the destination folder.")}
      onSubmit={() => {
        if (!dest) return;
        moveFiles(fileIds, dest);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!dest}>
            {t("Déplacer ici", "Move here")}
          </Button>
        </>
      }
    >
      <FolderPicker value={dest} onChange={setDest} exclude={current} />
    </Modal>
  );
}

function ShareDialog({ file }: { file: VaultFile }) {
  const { updateFile, openDialog } = useVault();
  const [visibility, setVisibility] = useState(file.visibility);
  const option = (id: "private" | "team", Icon: typeof Lock, label: string, hint: string) => (
    <button
      type="button"
      aria-pressed={visibility === id}
      onClick={() => setVisibility(id)}
      className={clsx("flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-150", visibility === id ? "border-ink" : "border-line hover:border-neutral-300")}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-neutral-600">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-[12px] text-neutral-500">{hint}</span>
      </span>
      <span className={clsx("size-4 shrink-0 rounded-full border", visibility === id ? "border-[5px] border-ink" : "border-neutral-300")} />
    </button>
  );
  return (
    <Modal
      title={t("Partager", "Share")}
      description={fullName(file)}
      onSubmit={() => {
        if (visibility !== file.visibility) updateFile(file.id, { visibility });
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit">
            {t("Enregistrer l’accès", "Save access")}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {option("private", Lock, t("Privé", "Private"), t("Vous seul pouvez ouvrir ce fichier.", "Only you can open this file."))}
        {option("team", Users, t("Espace de travail", "Workspace"), t("Toutes les personnes de l’espace NDF Vault.", "Everyone in the NDF Vault workspace."))}
      </div>
      <div className="mt-4">
        <Note>
          {t(
            "Inviter des personnes précises et créer des liens de partage demande des comptes invités. Cela arrivera avec la connexion des invités.",
            "Inviting specific people and creating share links requires guest accounts. This will come with guest sign-in.",
          )}
        </Note>
      </div>
    </Modal>
  );
}

function VersionsDialog({ file }: { file: VaultFile }) {
  const v = useVault();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = (id: string) => USERS.find((u) => u.id === id) ?? USERS[0];
  const older = file.versions ?? [];
  const total = older.length + 1;

  const pick = async (list: FileList | null) => {
    const chosen = list?.[0];
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const check = await inspectUpload(chosen);
    if (check.error) setError(check.error);
    else if (check.ext !== file.ext) setError(t(`La nouvelle version doit être au même format (.${file.ext}).`, `The new version must be in the same format (.${file.ext}).`));
    else if (check.sha256 && check.sha256 === file.sha256) setError(t("Ce fichier est identique à la version actuelle.", "This file is identical to the current version."));
    else await v.addVersion(file.id, check);
    setBusy(false);
  };

  const row = "flex items-center gap-3 border-t border-hair px-3 py-2.5 first:border-t-0";
  return (
    <Modal
      title={t("Historique des versions", "Version history")}
      description={fullName(file)}
      width={520}
      footer={
        <>
          <Button onClick={() => v.openDialog(null)}>{t("Fermer", "Close")}</Button>
          {!file.sample && (
            <Button variant="primary" icon={CloudUpload} disabled={busy || !v.persistent} onClick={() => input.current?.click()}>
              {busy ? t("Analyse…", "Analyzing…") : t("Nouvelle version", "New version")}
            </Button>
          )}
        </>
      }
    >
      <input
        ref={input}
        id="version-input"
        type="file"
        accept={`.${file.ext}`}
        className="sr-only"
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = "";
        }}
      />
      <ul aria-label="Versions" className="overflow-hidden rounded-[10px] border border-line">
        <li className={row}>
          <Avatar user={user(file.ownerId)} size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[13px] font-medium text-ink">Version {total}</p>
            <p className="truncate text-[12px] text-neutral-500">
              {user(file.ownerId).name} · {formatDate(file.versionAt ?? file.modifiedAt)}, {formatTime(file.versionAt ?? file.modifiedAt)} · {formatSize(file.size)}
            </p>
          </div>
          <Chip className="!border-emerald-300 !text-emerald-700">{t("Actuelle", "Current")}</Chip>
        </li>
        {older.map((ver, k) => (
          <li key={ver.id} className={row}>
            <Avatar user={user(ver.ownerId)} size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[13px] font-medium text-ink">Version {total - 1 - k}</p>
              <p className="truncate text-[12px] text-neutral-500">
                {user(ver.ownerId).name} · {formatDate(ver.at)}, {formatTime(ver.at)} · {formatSize(ver.size)}
              </p>
            </div>
            {file.kind !== "image" && (
              <Button size="sm" onClick={() => v.openDialog({ type: "compare", fileId: file.id, versionId: ver.id })}>
                {t("Comparer", "Compare")}
              </Button>
            )}
            <IconButton icon={Download} label={t(`Télécharger la version ${total - 1 - k}`, `Download version ${total - 1 - k}`)} variant="ghost" size="sm" onClick={() => void v.downloadVersion(file.id, ver.id)} />
            <Button size="sm" onClick={() => void v.restoreVersion(file.id, ver.id)}>
              {t("Restaurer", "Restore")}
            </Button>
            <IconButton icon={Trash2} label={t(`Supprimer la version ${total - 1 - k}`, `Delete version ${total - 1 - k}`)} variant="ghost" size="sm" onClick={() => v.deleteVersion(file.id, ver.id)} />
          </li>
        ))}
      </ul>
      <p role="alert" className="min-h-[20px] pt-2 text-[12.5px] text-red-600">
        {error ?? ""}
      </p>
      <Note>
        {file.sample
          ? t(
              "Fichier d’exemple : il n’a pas d’original, donc pas de versions. Téléversez un vrai fichier pour en garder l’historique.",
              "Sample file: it has no original, so no versions. Upload a real file to keep its history.",
            )
          : t(
              "Une nouvelle version remplace l’actuelle, qui reste ici : vous pouvez la télécharger ou la restaurer à tout moment.",
              "A new version replaces the current one, which stays here: you can download or restore it at any time.",
            )}
      </Note>
    </Modal>
  );
}

function DeleteDialog({ fileIds }: { fileIds: string[] }) {
  const { files, deleteFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const what = fileIds.length === 1 && first ? t(`« ${fullName(first)} »`, `“${fullName(first)}”`) : t(count(fileIds.length, "fichier"), count(fileIds.length, "file"));
  return (
    <Modal
      title={fileIds.length === 1 ? t("Supprimer le fichier ?", "Delete file?") : t("Supprimer les fichiers ?", "Delete files?")}
      onSubmit={() => {
        deleteFiles(fileIds);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
            {t("Supprimer", "Delete")}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {t(
          <>
            {what} {fileIds.length === 1 ? "ira" : "iront"} dans <span className="font-medium text-ink">Fichiers archivés → Supprimés</span>, où une restauration reste possible.
          </>,
          <>
            {what} will go to <span className="font-medium text-ink">Archived files → Deleted</span>, where {fileIds.length === 1 ? "it" : "they"} can still be restored.
          </>,
        )}
      </p>
    </Modal>
  );
}

function NewFolderDialog({ parentId }: { parentId: string }) {
  const { folders, addFolder, navigate, openDialog } = useVault();
  const flat = useFlatFolders(folders);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(folders.some((f) => f.id === parentId) ? parentId : "root");
  return (
    <Modal
      title={t("Nouveau dossier", "New folder")}
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addFolder(name, parent);
        openDialog(null);
        if (id) navigate({ view: "folder", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            {t("Créer le dossier", "Create folder")}
          </Button>
        </>
      }
    >
      <Field label={t("Nom du dossier", "Folder name")}>
        <input data-autofocus id="new-folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} placeholder={t("ex. Repérage des lieux", "e.g. Location scouting")} />
      </Field>
      <Field label={t("Dans", "In")}>
        <select value={parent} onChange={(e) => setParent(e.target.value)} className={INPUT}>
          {flat.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>
              {"  ".repeat(depth)}
              {folderLabel(folder)}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

function NewProjectDialog() {
  const { addProject, navigate, openDialog } = useVault();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [period, setPeriod] = useState("");
  return (
    <Modal
      title={t("Nouveau projet", "New project")}
      description={t("Crée un espace de projet et son dossier dans 04 Production.", "Creates a project space and its folder in 04 Production.")}
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addProject({ name, code, period });
        openDialog(null);
        if (id) navigate({ view: "project", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            {t("Créer le projet", "Create project")}
          </Button>
        </>
      }
    >
      <Field label={t("Nom du projet", "Project name")}>
        <input data-autofocus id="new-project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} placeholder={t("ex. Production Blitz Three", "e.g. Production Blitz Three")} />
      </Field>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} className={INPUT} placeholder="PB3" />
        </Field>
        <Field label={t("Période", "Period")}>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className={INPUT} placeholder={t("Période de production prévue", "Planned production period")} />
        </Field>
      </div>
    </Modal>
  );
}

function UploadDialog({ folderId, initial, picked }: { folderId: string | null; initial?: File[]; picked?: Picked[] }) {
  const { files, folders, projects, uploadFiles, openDialog, navigate, persistent } = useVault();
  const flat = useFlatFolders(folders);
  const [items, setItems] = useState<UploadCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [dest, setDest] = useState(folderId && folders.some((f) => f.id === folderId) ? folderId : "root");
  const [projectId, setProjectId] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  // Each file is read before it is accepted: its content must match its extension.
  const known = useMemo(() => files.filter((f) => f.sha256 && !f.deleted).map((f) => ({ sha256: f.sha256, label: fullName(f) })), [files]);
  const add = (chosen: Picked[]) => {
    if (!chosen.length) return;
    setPending((n) => n + chosen.length);
    for (const { file, path } of chosen) {
      void inspectUpload(file, known).then((check) => {
        // A file that came inside a folder remembers where: the folders are created with it.
        setItems((prev) => [...prev, path.length ? { ...check, path } : check]);
        setPending((n) => n - 1);
      });
    }
  };
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    add(picked ?? pickedFromInput(initial ?? []));
    // Files handed over when the dialog opens are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const valid = items.filter((it) => !it.error);
  /** A file identical to one already in the vault, or to an earlier one in this same batch. */
  const twinOf = (it: UploadCheck, index: number) => it.duplicateOf ?? items.slice(0, index).find((o) => !o.error && o.sha256 && o.sha256 === it.sha256)?.file.name;
  const submit = async () => {
    if (!valid.length || busy || pending > 0) return;
    setBusy(true);
    const added = await uploadFiles(valid, dest, projectId || null);
    setBusy(false);
    openDialog(null);
    if (added) navigate({ view: "folder", id: dest });
  };

  return (
    <Modal
      title={t("Téléverser des fichiers", "Upload files")}
      description={t("PDF, DOCX, XLSX, PPTX, TXT, CSV et images — 100 Mo maximum par fichier.", "PDF, DOCX, XLSX, PPTX, TXT, CSV and images — 100 MB maximum per file.")}
      onSubmit={submit}
      width={540}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!valid.length || busy || pending > 0 || !persistent}>
            {pending > 0
              ? t("Analyse…", "Analyzing…")
              : busy
                ? t("Téléversement…", "Uploading…")
                : valid.length
                  ? t(`Téléverser ${count(valid.length, "fichier")}`, `Upload ${count(valid.length, "file")}`)
                  : t("Téléverser", "Upload")}
          </Button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void pickedFromDrop(e.dataTransfer).then(add);
        }}
        className={clsx(
          "flex flex-col items-center rounded-xl border border-dashed px-6 text-center transition-colors duration-150",
          items.length ? "py-5" : "py-9",
          over ? "border-ink bg-fill" : "border-neutral-300 bg-subtle",
        )}
      >
        <span className="mb-3 flex size-10 items-center justify-center rounded-[10px] border border-line bg-white text-neutral-500 shadow-xs">
          <CloudUpload className="size-[18px]" strokeWidth={1.75} />
        </span>
        <p className="text-[13.5px] font-medium text-ink">{t("Glissez vos fichiers ou un dossier ici", "Drag your files or a folder here")}</p>
        <p className="mt-1 text-[12.5px] text-neutral-500">{t("ou choisissez-les sur votre ordinateur — un dossier garde ses sous-dossiers", "or choose them on your computer — a folder keeps its subfolders")}</p>
        <input
          ref={input}
          id="upload-input"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            add(pickedFromInput(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          id="upload-folder-input"
          type="file"
          multiple
          className="sr-only"
          // Not in React's types: asks the browser for a folder instead of files.
          {...({ webkitdirectory: "" } as object)}
          onChange={(e) => {
            add(pickedFromInput(e.target.files));
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()}>{t("Parcourir", "Browse")}</Button>
          <Button icon={FolderUp} onClick={() => folderInput.current?.click()}>
            {t("Choisir un dossier", "Choose a folder")}
          </Button>
        </div>
      </div>

      {pending > 0 && <p className="mt-3 text-[12.5px] text-neutral-500">{t(`Vérification du contenu de ${count(pending, "fichier")}…`, `Checking the contents of ${count(pending, "file")}…`)}</p>}
      {items.length > 0 && (
        <ul aria-label={t("Fichiers choisis", "Chosen files")} className="scroll-quiet mt-3 max-h-[168px] overflow-y-auto rounded-[10px] border border-line">
          {items.map((it, i) => (
            <li key={`${it.file.name}-${i}`} className="flex min-h-[44px] items-center gap-3 border-t border-hair px-3 py-1.5 first:border-t-0">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium text-ink">
                  {it.path?.length ? <span className="font-normal text-neutral-500">{it.path.join(" / ")} / </span> : null}
                  {it.file.name}
                </p>
                <p className={clsx("truncate text-[12px]", it.error ? "text-red-600" : "text-neutral-500")}>
                  {it.error ?? formatSize(it.file.size)}
                  {!it.error && twinOf(it, i) && <span className="text-amber-700">{t(` · Identique à « ${twinOf(it, i)} »`, ` · Identical to “${twinOf(it, i)}”`)}</span>}
                </p>
              </div>
              <IconButton icon={X} label={t(`Retirer ${it.file.name}`, `Remove ${it.file.name}`)} variant="ghost" size="sm" onClick={() => setItems((prev) => prev.filter((_, k) => k !== i))} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t("Dossier de destination", "Destination folder")}>
          <select id="upload-folder" value={dest} onChange={(e) => setDest(e.target.value)} className={INPUT}>
            {flat.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {"  ".repeat(depth)}
                {folderLabel(folder)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Projet", "Project")}>
          <select id="upload-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
            <option value="">{t("Sans projet", "No project")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Note>
          {persistent
            ? t(
                "Les fichiers restent dans ce navigateur, sur cet appareil. Rien n’est envoyé sur un serveur et personne d’autre ne les voit.",
                "Files stay in this browser, on this device. Nothing is sent to a server and no one else sees them.",
              )
            : t(
                "Ce navigateur refuse le stockage local (fenêtre privée ou données de site bloquées) : le téléversement est désactivé.",
                "This browser refuses local storage (private window or blocked site data): upload is disabled.",
              )}
        </Note>
      </div>
    </Modal>
  );
}

function PurgeDialog({ fileIds }: { fileIds: string[] }) {
  const { files, purgeFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const what = fileIds.length === 1 && first ? t(`« ${fullName(first)} »`, `“${fullName(first)}”`) : t(count(fileIds.length, "fichier"), count(fileIds.length, "file"));
  return (
    <Modal
      title={t("Supprimer définitivement ?", "Delete permanently?")}
      onSubmit={() => {
        purgeFiles(fileIds);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
            {t("Supprimer définitivement", "Delete permanently")}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {t(
          <>
            {what} et {fileIds.length === 1 ? "son original seront effacés" : "leurs originaux seront effacés"} de ce navigateur. Cette action est irréversible.
          </>,
          <>
            {what} and {fileIds.length === 1 ? "its original" : "their originals"} will be erased from this browser. This action cannot be undone.
          </>,
        )}
      </p>
    </Modal>
  );
}

/** What changed in the text between an earlier version of a document and the current one. */
function CompareDialog({ fileId, versionId }: { fileId: string; versionId: string }) {
  const { files, compareVersion, openDialog } = useVault();
  const file = files.find((f) => f.id === fileId);
  const version = file?.versions?.find((ver) => ver.id === versionId);
  const [result, setResult] = useState<CompareResult | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void compareVersion(fileId, versionId).then(setResult);
    // Runs once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const diff = result?.status === "ok" ? result.diff : null;
  const unchanged = diff !== null && diff.added === 0 && diff.removed === 0 && diff.parts.every((p) => p.type === "same");
  return (
    <Modal
      title={t("Comparer les versions", "Compare versions")}
      description={
        file && version
          ? t(`${fullName(file)} — de la version du ${formatDate(version.at)} à la version actuelle`, `${fullName(file)} — from the version of ${formatDate(version.at)} to the current version`)
          : undefined
      }
      width={760}
      footer={
        <>
          <Button onClick={() => file && openDialog({ type: "versions", fileId: file.id })}>{t("Retour aux versions", "Back to versions")}</Button>
          <Button variant="primary" onClick={() => openDialog(null)}>
            {t("Fermer", "Close")}
          </Button>
        </>
      }
    >
      {!result ? (
        <p role="status" className="py-6 text-center text-[13.5px] text-neutral-500">
          {t("Lecture des deux versions…", "Reading both versions…")}
        </p>
      ) : result.status === "no-text" ? (
        <p className="py-6 text-center text-[13.5px] text-neutral-600">
          {t(
            "Ces versions ne contiennent pas de texte à comparer (un PDF numérisé, par exemple, n’est fait que d’images).",
            "These versions contain no text to compare (a scanned PDF, for example, is made only of images).",
          )}
        </p>
      ) : result.status === "unreadable" || !diff ? (
        <p className="py-6 text-center text-[13.5px] text-neutral-600">
          {t("L’une des deux versions ne peut pas être lue : elle est introuvable, altérée ou illisible.", "One of the two versions cannot be read: it is missing, corrupted or unreadable.")}
        </p>
      ) : (
        <div data-compare>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-600">
            {unchanged ? (
              <span className="font-medium text-ink">{t("Le texte est identique dans les deux versions.", "The text is identical in both versions.")}</span>
            ) : (
              <>
                <span data-added className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-300" /> {t(count(diff.added, "mot ajouté", "mots ajoutés"), count(diff.added, "word added", "words added"))}
                </span>
                <span data-removed className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-red-300" /> {t(count(diff.removed, "mot retiré", "mots retirés"), count(diff.removed, "word removed", "words removed"))}
                </span>
              </>
            )}
          </p>
          {diff.rewritten && (
            <p className="mt-2 text-[12.5px] text-neutral-500">
              {t("Les deux versions n’ont presque rien en commun : l’ancienne est affichée, puis la nouvelle.", "The two versions have almost nothing in common: the old one is shown, then the new one.")}
            </p>
          )}
          {!diff.rewritten && diff.unit === "lines" && <p className="mt-2 text-[12.5px] text-neutral-500">{t("Document long : la comparaison est faite ligne par ligne.", "Long document: the comparison is made line by line.")}</p>}
          {!unchanged && (
            <div className="scroll-quiet mt-3 max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border border-line bg-white px-4 py-3.5 text-[13.5px] leading-[1.75] text-neutral-800">
              {foldUnchanged(diff.parts).map((p, i) =>
                p.type === "gap" ? (
                  <span key={i} className="my-2 block select-none text-center text-[12px] text-neutral-400">
                    {t(`⋯ ${p.hidden.toLocaleString("fr-CA")} caractères inchangés ⋯`, `⋯ ${p.hidden.toLocaleString("en-US")} unchanged characters ⋯`)}
                  </span>
                ) : p.type === "added" ? (
                  <ins key={i} className="rounded-[3px] bg-emerald-100 px-0.5 text-emerald-900 no-underline">
                    {p.text}
                  </ins>
                ) : p.type === "removed" ? (
                  <del key={i} className="rounded-[3px] bg-red-100 px-0.5 text-red-800">
                    {p.text}
                  </del>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </div>
          )}
          <p className="mt-3 text-[12px] leading-[17px] text-neutral-500">
            {t(
              "La comparaison porte sur le texte seulement : la mise en page, les images et les tableaux déplacés n’y figurent pas.",
              "The comparison covers the text only: layout, images and moved tables are not included.",
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}

/** Choose how far a document is protected. Lowering the level in a protected vault takes the passphrase. */
function ProtectionDialog({ fileIds }: { fileIds: string[] }) {
  const { files, setProtection, security, openDialog } = useVault();
  const targets = files.filter((f) => fileIds.includes(f.id) && !f.sample);
  const current = highest(targets.map((f) => protectionOf(f)));
  const [level, setLevel] = useState<Protection>(current);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const needsPassphrase = security.protected && targets.some((f) => lowers(protectionOf(f), level));
  const ready = !busy && level !== current && (!needsPassphrase || passphrase.length > 0);
  return (
    <Modal
      title={t("Protection du document", "Document protection")}
      description={targets.length === 1 ? fullName(targets[0]) : `${targets.length} documents`}
      width={500}
      onSubmit={async () => {
        if (!ready) return;
        setBusy(true);
        setWrong(false);
        if ((await setProtection(fileIds, level, passphrase)) === "ok") return openDialog(null);
        setWrong(true);
        setBusy(false);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            {t("Appliquer", "Apply")}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("Niveau de protection", "Protection level")} className="space-y-2">
        {PROTECTION_LEVELS.map((l) => (
          <label key={l} className={clsx("flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors duration-150", level === l ? "border-ink bg-subtle" : "border-line hover:border-neutral-300")}>
            <input type="radio" name="protection-level" value={l} checked={level === l} onChange={() => setLevel(l)} className="mt-1 size-4 shrink-0 accent-black" />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-ink">{PROTECTION_LABEL[l]}</span>
              <span className="mt-0.5 block text-[12.5px] leading-[18px] text-neutral-600">{PROTECTION_HINT[l]}</span>
            </span>
          </label>
        ))}
      </div>
      {needsPassphrase && (
        <div className="mt-4">
          <Field label={t("Phrase secrète", "Passphrase")} hint={t("Demandée pour retirer une protection.", "Required to remove a protection.")}>
            <PassphraseInput id="protection-passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" />
            <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
              {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
            </p>
          </Field>
        </div>
      )}
      <div className="mt-4">
        <Note>
          {t(
            "Ces protections freinent la copie et permettent de remonter à son origine. Elles ne peuvent pas empêcher quelqu’un de photographier un écran : c’est le filigrane et son code de consultation qui désignent alors la personne.",
            "These protections slow down copying and make it possible to trace a copy back to its source. They cannot stop someone from photographing a screen: the watermark and its viewing code are then what identify the person.",
          )}
        </Note>
      </div>
    </Modal>
  );
}

function ResetDialog() {
  const { resetVault, verifyPassphrase, security, openDialog } = useVault();
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  return (
    <Modal
      title={t("Réinitialiser le Vault ?", "Reset the Vault?")}
      onSubmit={async () => {
        if (busy || (security.protected && !current)) return;
        setBusy(true);
        setWrong(false);
        // Erasing a protected vault takes its passphrase.
        if (!(await verifyPassphrase(current))) {
          setWrong(true);
          return setBusy(false);
        }
        openDialog(null);
        void resetVault();
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={busy || (security.protected && !current)} className="!bg-red-600 hover:!bg-red-700 disabled:!bg-neutral-400">
            {t("Tout réinitialiser", "Reset everything")}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {t(
          "Tous les fichiers téléversés, dossiers et projets créés dans ce navigateur seront effacés, et les données d’exemple reviendront. Cette action est irréversible.",
          "All uploaded files, folders and projects created in this browser will be erased, and the sample data will come back. This action cannot be undone.",
        )}
      </p>
      {security.protected && (
        <div className="mt-4">
          <Field label={t("Phrase secrète", "Passphrase")}>
            <PassphraseInput id="reset-passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
            <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
              {wrong ? t("Phrase secrète incorrecte.", "Incorrect passphrase.") : ""}
            </p>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function RenameFolderDialog({ folder }: { folder: Folder }) {
  const { renameFolder, openDialog } = useVault();
  const [name, setName] = useState(folder.name);
  return (
    <Modal
      title={t("Renommer le dossier", "Rename folder")}
      onSubmit={() => {
        if (!name.trim()) return;
        renameFolder(folder.id, name);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === folder.name}>
            {t("Renommer", "Rename")}
          </Button>
        </>
      }
    >
      <Field label={t("Nom du dossier", "Folder name")}>
        <input data-autofocus id="folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} onFocus={(e) => e.target.select()} />
      </Field>
    </Modal>
  );
}

function MoveFolderDialog({ folder }: { folder: Folder }) {
  const { folders, moveFolder, openDialog } = useVault();
  const [dest, setDest] = useState("");
  // A folder cannot go inside itself, and its current parent would change nothing.
  const blocked = useMemo(() => {
    const set = descendantIds(folders, folder.id);
    if (folder.parentId) set.add(folder.parentId);
    return set;
  }, [folders, folder]);
  return (
    <Modal
      title={t("Déplacer le dossier", "Move folder")}
      description={folderLabel(folder)}
      onSubmit={() => {
        if (dest && moveFolder(folder.id, dest)) openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!dest}>
            {t("Déplacer ici", "Move here")}
          </Button>
        </>
      }
    >
      <FolderPicker value={dest} onChange={setDest} disabled={blocked} />
    </Modal>
  );
}

function DeleteFolderDialog({ folder }: { folder: Folder }) {
  const { folders, files, projects, deleteFolder, navigate, openDialog } = useVault();
  const blocked = folderRules(folder, folders, files, projects).deleteBlocked;
  return (
    <Modal
      title={blocked ? t("Ce dossier ne peut pas être supprimé", "This folder cannot be deleted") : t("Supprimer le dossier ?", "Delete folder?")}
      onSubmit={() => {
        if (blocked) return openDialog(null);
        const parent = folder.parentId ?? "root";
        if (deleteFolder(folder.id)) navigate({ view: "folder", id: parent });
        openDialog(null);
      }}
      footer={
        blocked ? (
          <Button onClick={() => openDialog(null)}>{t("Fermer", "Close")}</Button>
        ) : (
          <>
            <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
            <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
              {t("Supprimer", "Delete")}
            </Button>
          </>
        )
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">{blocked ?? t(`Le dossier « ${folder.name} » est vide et sera supprimé.`, `The folder “${folder.name}” is empty and will be deleted.`)}</p>
    </Modal>
  );
}

function EditProjectDialog({ project }: { project: Project }) {
  const { updateProject, openDialog } = useVault();
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [period, setPeriod] = useState(project.period);
  const [summary, setSummary] = useState(project.summary);
  return (
    <Modal
      title={t("Modifier le projet", "Edit project")}
      width={480}
      onSubmit={() => {
        if (!name.trim()) return;
        updateProject(project.id, { name, code, period, summary });
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>{t("Annuler", "Cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            {t("Enregistrer", "Save")}
          </Button>
        </>
      }
    >
      <Field label={t("Nom du projet", "Project name")}>
        <input data-autofocus id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} />
      </Field>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Code">
          <input id="project-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} className={INPUT} />
        </Field>
        <Field label={t("Période", "Period")}>
          <input id="project-period" value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={120} className={INPUT} />
        </Field>
      </div>
      <Field label={t("Résumé", "Summary")}>
        <textarea id="project-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={300} className={clsx(INPUT, "h-auto resize-none py-2 leading-5")} />
      </Field>
    </Modal>
  );
}

export function Dialogs() {
  const { dialog, files, folders, projects } = useVault();
  if (!dialog) return null;
  const folder = "folderId" in dialog && dialog.type !== "upload" ? folders.find((f) => f.id === dialog.folderId) : undefined;
  const file = "fileId" in dialog ? files.find((f) => f.id === dialog.fileId) : undefined;
  switch (dialog.type) {
    case "rename":
      return file ? <RenameDialog key={file.id} file={file} /> : null;
    case "details":
      return file ? <DetailsDialog key={file.id} file={file} /> : null;
    case "share":
      return file ? <ShareDialog key={file.id} file={file} /> : null;
    case "versions":
      return file ? <VersionsDialog file={file} /> : null;
    case "renameFolder":
      return folder ? <RenameFolderDialog key={folder.id} folder={folder} /> : null;
    case "moveFolder":
      return folder ? <MoveFolderDialog key={folder.id} folder={folder} /> : null;
    case "deleteFolder":
      return folder ? <DeleteFolderDialog folder={folder} /> : null;
    case "editProject": {
      const project = projects.find((p) => p.id === dialog.projectId);
      return project ? <EditProjectDialog key={project.id} project={project} /> : null;
    }
    case "move":
      return <MoveDialog fileIds={dialog.fileIds} />;
    case "delete":
      return <DeleteDialog fileIds={dialog.fileIds} />;
    case "newFolder":
      return <NewFolderDialog parentId={dialog.parentId} />;
    case "newProject":
      return <NewProjectDialog />;
    case "protect":
      return <ProtectDialog />;
    case "passphrase":
      return <PassphraseDialog />;
    case "unprotect":
      return <UnprotectDialog />;
    case "recovery":
      return <RecoveryDialog />;
    case "backup":
      return <BackupDialog />;
    case "restore":
      return <RestoreDialog />;
    case "audit":
      return <AuditDialog />;
    case "protection":
      return <ProtectionDialog fileIds={dialog.fileIds} />;
    case "compare":
      return <CompareDialog fileId={dialog.fileId} versionId={dialog.versionId} />;
    case "unlockDoc":
      return <UnlockDocDialog fileId={dialog.fileId} listIds={dialog.listIds} fullscreen={dialog.fullscreen} page={dialog.page} />;
    case "exportVault":
      return <ExportVaultDialog />;
    case "purge":
      return <PurgeDialog fileIds={dialog.fileIds} />;
    case "reset":
      return <ResetDialog />;
    case "upload":
      return <UploadDialog folderId={dialog.folderId} initial={dialog.files} picked={dialog.picked} />;
  }
}

/* -------------------------------------------------------------------- Toast */

export function ToastHost() {
  const { toast, dismissToast } = useVault();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4 sm:justify-end sm:px-6">
      <div key={toast.id} role="status" data-toast className="pointer-events-auto flex max-w-[440px] animate-rise items-center gap-3 rounded-xl border border-line bg-white py-2 pl-4 pr-2 shadow-menu">
        <p className="min-w-0 flex-1 text-[13px] text-neutral-800">{toast.message}</p>
        {toast.undo && (
          <Button
            size="sm"
            onClick={() => {
              toast.undo?.();
              dismissToast();
            }}
          >
            {t("Annuler", "Undo")}
          </Button>
        )}
        <IconButton icon={X} label={t("Fermer", "Close")} variant="ghost" size="sm" onClick={dismissToast} />
      </div>
    </div>
  );
}
