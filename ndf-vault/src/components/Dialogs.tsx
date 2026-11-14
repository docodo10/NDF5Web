"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { CloudUpload, Info, Lock, Users, X } from "lucide-react";
import { FolderIcon } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { FileStatus, Folder, VaultFile } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { folderLabel, formatDate, formatTime, fullName } from "@/lib/format";
import { Avatar, Button, Chip, IconButton } from "./ui";

/* -------------------------------------------------------------- Modal shell */

function Modal({ title, description, children, footer, onSubmit, width = 440 }: { title: string; description?: string; children: ReactNode; footer: ReactNode; onSubmit?: () => void; width?: number }) {
  const { openDialog } = useVault();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && openDialog(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] animate-fade bg-neutral-900/20 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Land on the field to fill in (or the dialog itself), never on the close button.
            e.preventDefault();
            const root = e.currentTarget as HTMLElement;
            (root.querySelector<HTMLElement>("[data-autofocus]") ?? root).focus();
          }}
          className="fixed left-1/2 top-1/2 z-[81] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-white shadow-modal focus:outline-none"
          style={{ maxWidth: width }}
        >
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5">
              <div className="min-w-0">
                <Dialog.Title className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
                {description && <p className="mt-1 text-[13px] text-neutral-500">{description}</p>}
              </div>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Close" variant="ghost" size="sm" className="-mr-1.5 -mt-1" />
              </Dialog.Close>
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            <div className="flex items-center justify-end gap-2 border-t border-hair px-5 py-3.5">{footer}</div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const INPUT =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink shadow-xs transition-colors duration-150 placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-400";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block last:mb-0">
      <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-neutral-500">{hint}</span>}
    </label>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[10px] border border-dashed border-line bg-subtle px-3 py-2.5 text-[12.5px] leading-[18px] text-neutral-600">
      <Info className="mt-px size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
      <p>{children}</p>
    </div>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[12px] text-neutral-500">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150", on ? "bg-ink" : "bg-neutral-300")}
      >
        <span className={clsx("absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-xs transition-transform duration-150", on && "translate-x-4")} />
      </button>
    </div>
  );
}

export { Toggle as SwitchRow };

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
      title="Rename file"
      onSubmit={save}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || name.trim() === file.name}>
            Rename
          </Button>
        </>
      }
    >
      <Field label="File name">
        <div className="flex items-center gap-2">
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} onFocus={(e) => e.target.select()} />
          <span className="shrink-0 text-[13px] text-neutral-500">.{file.ext}</span>
        </div>
      </Field>
    </Modal>
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
      title="Edit details"
      description={fullName(file)}
      onSubmit={save}
      width={480}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit">
            Save details
          </Button>
        </>
      }
    >
      <Field label="Status">
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
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Project">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tags" hint="Separate tags with commas.">
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT} placeholder="screenplay, FS1" />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={clsx(INPUT, "h-auto resize-none py-2 leading-5")} placeholder="Add a note for collaborators" />
      </Field>
      <div className="mt-1 divide-y divide-hair border-t border-hair pt-1">
        <Toggle on={favorite} onChange={setFavorite} label="Favorite" />
        <Toggle on={pinned} onChange={setPinned} label="Pin to Home" />
      </div>
    </Modal>
  );
}

function FolderPicker({ value, onChange, exclude }: { value: string; onChange: (id: string) => void; exclude?: string }) {
  const { folders } = useVault();
  const flat = useFlatFolders(folders);
  return (
    <ul className="scroll-quiet max-h-[280px] overflow-y-auto rounded-[10px] border border-line p-1" role="listbox" aria-label="Destination folder">
      {flat.map(({ folder, depth }) => {
        const on = value === folder.id;
        return (
          <li key={folder.id}>
            <button
              type="button"
              role="option"
              aria-selected={on}
              disabled={folder.id === exclude}
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
      title={fileIds.length === 1 && first ? "Move file" : `Move ${fileIds.length} files`}
      description={fileIds.length === 1 && first ? fullName(first) : "Choose a destination folder."}
      onSubmit={() => {
        if (!dest) return;
        moveFiles(fileIds, dest);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!dest}>
            Move here
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
      title="Share"
      description={fullName(file)}
      onSubmit={() => {
        if (visibility !== file.visibility) updateFile(file.id, { visibility });
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit">
            Save access
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {option("private", Lock, "Private", "Only you can open this file.")}
        {option("team", Users, "Workspace", "Everyone in the NDF Vault workspace.")}
      </div>
      <div className="mt-4">
        <Note>Inviting specific people and share links need user accounts. They arrive with guest sign-in in the backend step.</Note>
      </div>
    </Modal>
  );
}

function VersionsDialog({ file }: { file: VaultFile }) {
  const { openDialog } = useVault();
  const owner = USERS.find((u) => u.id === file.ownerId)!;
  return (
    <Modal title="Version history" description={fullName(file)} footer={<Button onClick={() => openDialog(null)}>Close</Button>}>
      <div className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
        <Avatar user={owner} size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[13px] font-medium text-ink">Version 1</p>
          <p className="truncate text-[12px] text-neutral-500">
            {owner.name} · {formatDate(file.modifiedAt)}, {formatTime(file.modifiedAt)}
          </p>
        </div>
        <Chip>Current</Chip>
      </div>
      <div className="mt-4">
        <Note>Earlier versions will be listed here once a file is replaced with a new upload. Version storage arrives with the storage step.</Note>
      </div>
    </Modal>
  );
}

function DeleteDialog({ fileIds }: { fileIds: string[] }) {
  const { files, deleteFiles, openDialog } = useVault();
  const first = files.find((f) => f.id === fileIds[0]);
  const what = fileIds.length === 1 && first ? `“${fullName(first)}”` : `${fileIds.length} files`;
  return (
    <Modal
      title={fileIds.length === 1 ? "Delete file?" : "Delete files?"}
      onSubmit={() => {
        deleteFiles(fileIds);
        openDialog(null);
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit" className="!bg-red-600 hover:!bg-red-700">
            Delete
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-[21px] text-neutral-600">
        {what} will move to <span className="font-medium text-ink">Archived Files → Deleted</span>, where it can be restored.
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
      title="New folder"
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addFolder(name, parent);
        openDialog(null);
        navigate({ view: "folder", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Create folder
          </Button>
        </>
      }
    >
      <Field label="Folder name">
        <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Location Scouting" />
      </Field>
      <Field label="Inside">
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
      title="New project"
      description="Creates a project workspace and its folder under NDF SAGA."
      onSubmit={() => {
        if (!name.trim()) return;
        const id = addProject({ name, code, period });
        openDialog(null);
        navigate({ view: "project", id });
      }}
      footer={
        <>
          <Button onClick={() => openDialog(null)}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <Field label="Project name">
        <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Production Blitz Three" />
      </Field>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))} className={INPUT} placeholder="PB3" />
        </Field>
        <Field label="Period">
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className={INPUT} placeholder="Planned production window" />
        </Field>
      </div>
    </Modal>
  );
}

function UploadDialog() {
  const { openDialog } = useVault();
  return (
    <Modal title="Upload files" description="PDF, DOCX, XLSX, PPTX, TXT, CSV and images." footer={<Button onClick={() => openDialog(null)}>Close</Button>} width={500}>
      <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-300 bg-subtle px-6 py-10 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-[10px] border border-line bg-white text-neutral-500 shadow-xs">
          <CloudUpload className="size-[18px]" strokeWidth={1.75} />
        </span>
        <p className="text-[13.5px] font-medium text-ink">Drag and drop files here</p>
        <p className="mt-1 text-[12.5px] text-neutral-500">or browse from your computer — multiple files supported</p>
        <Button className="mt-4" disabled>
          Browse files
        </Button>
      </div>
      <div className="mt-4">
        <Note>This is the upload interface only. Real uploads with persistent, private storage are the next build step, so the button is disabled for now.</Note>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const { dialog, files } = useVault();
  if (!dialog) return null;
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
    case "move":
      return <MoveDialog fileIds={dialog.fileIds} />;
    case "delete":
      return <DeleteDialog fileIds={dialog.fileIds} />;
    case "newFolder":
      return <NewFolderDialog parentId={dialog.parentId} />;
    case "newProject":
      return <NewProjectDialog />;
    case "upload":
      return <UploadDialog />;
  }
}

/* -------------------------------------------------------------------- Toast */

export function ToastHost() {
  const { toast, dismissToast } = useVault();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4 sm:justify-end sm:px-6">
      <div key={toast.id} role="status" className="pointer-events-auto flex max-w-[440px] animate-rise items-center gap-3 rounded-xl border border-line bg-white py-2 pl-4 pr-2 shadow-menu">
        <p className="min-w-0 flex-1 text-[13px] text-neutral-800">{toast.message}</p>
        {toast.undo && (
          <Button
            size="sm"
            onClick={() => {
              toast.undo?.();
              dismissToast();
            }}
          >
            Undo
          </Button>
        )}
        <IconButton icon={X} label="Dismiss" variant="ghost" size="sm" onClick={dismissToast} />
      </div>
    </div>
  );
}
