"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, CloudUpload, Copy, Download, Lock, ShieldCheck, Trash2, TriangleAlert, Users, X } from "lucide-react";
import { FolderIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVault } from "@/lib/store";
import type { FileStatus, Folder, Project, VaultFile } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { count, descendantIds, folderLabel, formatDate, formatSize, formatTime, fullName, STATUS_LABEL } from "@/lib/format";
import { folderRules } from "@/lib/selectors";
import { ACCEPT_ATTR, inspectUpload, type UploadCheck } from "@/lib/uploads";
import { Avatar, Button, Chip, IconButton } from "./ui";
import { Field, INPUT, Modal, Note, PassphraseInput, Toggle } from "./dialog-kit";

import { AuditDialog, BackupDialog, ExportVaultDialog, PassphraseDialog, ProtectDialog, RecoveryDialog, RestoreDialog, UnprotectDialog } from "./security/SecurityDialogs";

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
      title="Renommer le fichier"
      onSubmit={save}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === file.name}>
            Renommer
          </Button>
        </>
      }
    >
      <Field label="Nom du fichier">
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
        <p className="text-[12.5px] font-medium text-neutral-700">Empreinte SHA-256</p>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 hover:text-ink">
          {copied ? <Check className="size-3.5" strokeWidth={2} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
          {copied ? "Copiée" : "Copier"}
        </button>
      </div>
      <p className="mt-1 select-all break-all font-mono text-[11.5px] leading-[17px] text-neutral-600">{file.sha256}</p>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p role="status" className={clsx("flex items-center gap-1.5 text-[12.5px]", state === "ok" ? "text-emerald-700" : state === "bad" ? "text-red-600" : "text-neutral-500")}>
          {state === "ok" && <ShieldCheck className="size-4" strokeWidth={1.75} />}
          {state === "bad" && <TriangleAlert className="size-4" strokeWidth={1.75} />}
          {state === "ok" ? "Intégrité vérifiée : l’original est intact." : state === "bad" ? "L’original ne correspond plus à cette empreinte." : "Calculée au téléversement."}
        </p>
        <Button
          size="sm"
          disabled={state === "busy"}
          onClick={async () => {
            setState("busy");
            setState((await readOriginal(file)).status === "ok" ? "ok" : "bad");
          }}
        >
          {state === "busy" ? "Vérification…" : "Vérifier"}
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
      title="Modifier les détails"
      description={fullName(file)}
      onSubmit={save}
      width={480}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit">
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Statut">
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
      <Field label="Projet">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
          <option value="">Sans projet</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Étiquettes" hint="Séparez les étiquettes par des virgules.">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT} placeholder="scénario, FS1" />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={clsx(INPUT, "h-auto resize-none py-2 leading-5")} placeholder="Ajoutez une note pour vos collaborateurs" />
      </Field>
      <div className="mt-1 divide-y divide-hair border-t border-hair pt-1">
        <Toggle on={favorite} onChange={setFavorite} label="Favori" />
        <Toggle on={pinned} onChange={setPinned} label="Épingler à l’accueil" />
      </div>
      {!file.sample && <Fingerprint file={file} />}
    </Modal>
  );
}

function FolderPicker({ value, onChange, exclude, disabled }: { value: string; onChange: (id: string) => void; exclude?: string; disabled?: Set<string> }) {
  const { folders } = useVault();
  const flat = useFlatFolders(folders);
  return (
    <ul className="scroll-quiet max-h-[280px] overflow-y-auto rounded-[10px] border border-line p-1" role="listbox" aria-label="Dossier de destination">
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
      title={fileIds.length === 1 && first ? "Déplacer le fichier" : `Déplacer ${count(fileIds.length, "fichier")}`}
      description={fileIds.length === 1 && first ? fullName(first) : "Choisissez le dossier de destination."}
      onSubmit={() => {
        if (!dest) return;
        moveFiles(fileIds, dest);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!dest}>
            Déplacer ici
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
      title="Partager"
      description={fullName(file)}
      onSubmit={() => {
        if (visibility !== file.visibility) updateFile(file.id, { visibility });
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit">
            Enregistrer l’accès
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {option("private", Lock, "Privé", "Vous seul pouvez ouvrir ce fichier.")}
        {option("team", Users, "Espace de travail", "Toutes les personnes de l’espace NDF Vault.")}
      </div>
      <div className="mt-4">
        <Note>Inviter des personnes précises et créer des liens de partage demande des comptes invités. Cela arrivera avec la connexion des invités.</Note>
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
    else if (check.ext !== file.ext) setError(`La nouvelle version doit être au même format (.${file.ext}).`);
    else if (check.sha256 && check.sha256 === file.sha256) setError("Ce fichier est identique à la version actuelle.");
    else await v.addVersion(file.id, check);
    setBusy(false);
  };

  const row = "flex items-center gap-3 border-t border-hair px-3 py-2.5 first:border-t-0";
  return (
    <Modal
      title="Historique des versions"
      description={fullName(file)}
      width={520}
      footer={
        <>
          <Button onClick={() => v.openDialog(null)}>Fermer</Button>
          {!file.sample && (
            <Button variant="primary" icon={CloudUpload} disabled={busy || !v.persistent} onClick={() => input.current?.click()}>
              {busy ? "Analyse…" : "Nouvelle version"}
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
          <Chip className="!border-emerald-300 !text-emerald-700">Actuelle</Chip>
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
            <IconButton icon={Download} label={`Télécharger la version ${total - 1 - k}`} variant="ghost" size="sm" onClick={() => void v.downloadVersion(file.id, ver.id)} />
            <Button size="sm" onClick={() => void v.restoreVersion(file.id, ver.id)}>
              Restaurer
            </Button>
            <IconButton icon={Trash2} label={`Supprimer la version ${total - 1 - k}`} variant="ghost" size="sm" onClick={() => v.deleteVersion(file.id, ver.id)} />
          </li>
        ))}
      </ul>
      <p role="alert" className="min-h-[20px] pt-2 text-[12.5px] text-red-600">
        {error ?? ""}
      </p>
      <Note>
        {file.sample
          ? "Fichier d’exemple : il n’a pas d’original, donc pas de versions. Téléversez un vrai fichier pour en garder l’historique."
          : "Une nouvelle version remplace l’actuelle, qui reste ici : vous pouvez la télécharger ou la restaurer à tout moment."}
      </Note>
    </Modal>
  );
}

function DeleteDialog({ fileIds }: { fileIds: string[] }) {
  const { files, deleteFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const what = fileIds.length === 1 && first ? `« ${fullName(first)} »` : count(fileIds.length, "fichier");
  return (
    <Modal
      title={fileIds.length === 1 ? "Supprimer le fichier ?" : "Supprimer les fichiers ?"}
      onSubmit={() => {
        deleteFiles(fileIds);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
            Supprimer
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {what} {fileIds.length === 1 ? "ira" : "iront"} dans <span className="font-medium text-ink">Fichiers archivés → Supprimés</span>, où une restauration reste possible.
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
      title="Nouveau dossier"
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addFolder(name, parent);
        openDialog(null);
        if (id) navigate({ view: "folder", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Créer le dossier
          </Button>
        </>
      }
    >
      <Field label="Nom du dossier">
        <input data-autofocus id="new-folder-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} placeholder="ex. Repérage des lieux" />
      </Field>
      <Field label="Dans">
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
      title="Nouveau projet"
      description="Crée un espace de projet et son dossier dans 04 Production."
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addProject({ name, code, period });
        openDialog(null);
        if (id) navigate({ view: "project", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Créer le projet
          </Button>
        </>
      }
    >
      <Field label="Nom du projet">
        <input data-autofocus id="new-project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} placeholder="ex. Production Blitz Three" />
      </Field>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} className={INPUT} placeholder="PB3" />
        </Field>
        <Field label="Période">
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className={INPUT} placeholder="Période de production prévue" />
        </Field>
      </div>
    </Modal>
  );
}

function UploadDialog({ folderId, initial }: { folderId: string | null; initial?: File[] }) {
  const { files, folders, projects, uploadFiles, openDialog, navigate, persistent } = useVault();
  const flat = useFlatFolders(folders);
  const [items, setItems] = useState<UploadCheck[]>([]);
  const [pending, setPending] = useState(0);
  const [dest, setDest] = useState(folderId && folders.some((f) => f.id === folderId) ? folderId : "root");
  const [projectId, setProjectId] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Each file is read before it is accepted: its content must match its extension.
  const known = useMemo(() => files.filter((f) => f.sha256 && !f.deleted).map((f) => ({ sha256: f.sha256, label: fullName(f) })), [files]);
  const add = (list: FileList | File[] | null) => {
    const chosen = Array.from(list ?? []);
    if (!chosen.length) return;
    setPending((n) => n + chosen.length);
    for (const file of chosen) {
      void inspectUpload(file, known).then((check) => {
        setItems((prev) => [...prev, check]);
        setPending((n) => n - 1);
      });
    }
  };
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initial?.length) add(initial);
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
      title="Téléverser des fichiers"
      description="PDF, DOCX, XLSX, PPTX, TXT, CSV et images — 100 Mo maximum par fichier."
      onSubmit={submit}
      width={540}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!valid.length || busy || pending > 0 || !persistent}>
            {pending > 0 ? "Analyse…" : busy ? "Téléversement…" : valid.length ? `Téléverser ${count(valid.length, "fichier")}` : "Téléverser"}
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
          add(e.dataTransfer.files);
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
        <p className="text-[13.5px] font-medium text-ink">Glissez vos fichiers ici</p>
        <p className="mt-1 text-[12.5px] text-neutral-500">ou choisissez-les sur votre ordinateur — plusieurs fichiers à la fois</p>
        <input
          ref={input}
          id="upload-input"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button className="mt-4" onClick={() => input.current?.click()}>
          Parcourir
        </Button>
      </div>

      {pending > 0 && <p className="mt-3 text-[12.5px] text-neutral-500">Vérification du contenu de {count(pending, "fichier")}…</p>}
      {items.length > 0 && (
        <ul aria-label="Fichiers choisis" className="scroll-quiet mt-3 max-h-[168px] overflow-y-auto rounded-[10px] border border-line">
          {items.map((it, i) => (
            <li key={`${it.file.name}-${i}`} className="flex min-h-[44px] items-center gap-3 border-t border-hair px-3 py-1.5 first:border-t-0">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium text-ink">{it.file.name}</p>
                <p className={clsx("truncate text-[12px]", it.error ? "text-red-600" : "text-neutral-500")}>
                  {it.error ?? formatSize(it.file.size)}
                  {!it.error && twinOf(it, i) && <span className="text-amber-700"> · Identique à « {twinOf(it, i)} »</span>}
                </p>
              </div>
              <IconButton icon={X} label={`Retirer ${it.file.name}`} variant="ghost" size="sm" onClick={() => setItems((prev) => prev.filter((_, k) => k !== i))} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Dossier de destination">
          <select id="upload-folder" value={dest} onChange={(e) => setDest(e.target.value)} className={INPUT}>
            {flat.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {"  ".repeat(depth)}
                {folderLabel(folder)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projet">
          <select id="upload-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
            <option value="">Sans projet</option>
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
            ? "Les fichiers restent dans ce navigateur, sur cet appareil. Rien n’est envoyé sur un serveur et personne d’autre ne les voit."
            : "Ce navigateur refuse le stockage local (fenêtre privée ou données de site bloquées) : le téléversement est désactivé."}
        </Note>
      </div>
    </Modal>
  );
}

function PurgeDialog({ fileIds }: { fileIds: string[] }) {
  const { files, purgeFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const what = fileIds.length === 1 && first ? `« ${fullName(first)} »` : count(fileIds.length, "fichier");
  return (
    <Modal
      title="Supprimer définitivement ?"
      onSubmit={() => {
        purgeFiles(fileIds);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {what} et {fileIds.length === 1 ? "son original seront effacés" : "leurs originaux seront effacés"} de ce navigateur. Cette action est irréversible.
      </p>
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
      title="Réinitialiser le Vault ?"
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
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={busy || (security.protected && !current)} className="!bg-red-600 hover:!bg-red-700 disabled:!bg-neutral-400">
            Tout réinitialiser
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        Tous les fichiers téléversés, dossiers et projets créés dans ce navigateur seront effacés, et les données d’exemple reviendront. Cette action est irréversible.
      </p>
      {security.protected && (
        <div className="mt-4">
          <Field label="Phrase secrète">
            <PassphraseInput id="reset-passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
            <p role="alert" className="mt-1.5 min-h-[18px] text-[12px] text-red-600">
              {wrong ? "Phrase secrète incorrecte." : ""}
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
      title="Renommer le dossier"
      onSubmit={() => {
        if (!name.trim()) return;
        renameFolder(folder.id, name);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === folder.name}>
            Renommer
          </Button>
        </>
      }
    >
      <Field label="Nom du dossier">
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
      title="Déplacer le dossier"
      description={folderLabel(folder)}
      onSubmit={() => {
        if (dest && moveFolder(folder.id, dest)) openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!dest}>
            Déplacer ici
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
      title={blocked ? "Ce dossier ne peut pas être supprimé" : "Supprimer le dossier ?"}
      onSubmit={() => {
        if (blocked) return openDialog(null);
        const parent = folder.parentId ?? "root";
        if (deleteFolder(folder.id)) navigate({ view: "folder", id: parent });
        openDialog(null);
      }}
      footer={
        blocked ? (
          <Button onClick={() => openDialog(null)}>Fermer</Button>
        ) : (
          <>
            <Button onClick={() => openDialog(null)}>Annuler</Button>
            <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
              Supprimer
            </Button>
          </>
        )
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">{blocked ?? `Le dossier « ${folder.name} » est vide et sera supprimé.`}</p>
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
      title="Modifier le projet"
      width={480}
      onSubmit={() => {
        if (!name.trim()) return;
        updateProject(project.id, { name, code, period, summary });
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Annuler</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Nom du projet">
        <input data-autofocus id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={INPUT} />
      </Field>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Code">
          <input id="project-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} className={INPUT} />
        </Field>
        <Field label="Période">
          <input id="project-period" value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={120} className={INPUT} />
        </Field>
      </div>
      <Field label="Résumé">
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
    case "exportVault":
      return <ExportVaultDialog />;
    case "purge":
      return <PurgeDialog fileIds={dialog.fileIds} />;
    case "reset":
      return <ResetDialog />;
    case "upload":
      return <UploadDialog folderId={dialog.folderId} initial={dialog.files} />;
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
            Annuler
          </Button>
        )}
        <IconButton icon={X} label="Fermer" variant="ghost" size="sm" onClick={dismissToast} />
      </div>
    </div>
  );
}
